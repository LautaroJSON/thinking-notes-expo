# Data Model: Migración etapa 1 — fundamentos y modo sin cuenta

**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## Tipos del dominio (traídos sin cambios de la app Vite)

`src/types/thinking.ts` y `src/types/index.ts`. Solo cambia de dónde sale el id: `uuidv4()`
pasa a ser `newId()` (R6), con el mismo formato.

### `INotes`

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | `string?` | Opcional en el tipo (compatibilidad con la app Vite). Siempre presente en notas locales. |
| `title` | `string` | Puede quedar vacío; vale `""` si el dato guardado no es texto. |
| `thinkings` | `Thinking[]` | Orden de creación. **No se reordena** (FR-014). |
| `createdAt` | `string?` (ISO) | Se fija al crear y nunca cambia. |
| `updatedAt` | `string?` (ISO) | Cambia al guardar contenido; no cambia al reordenar. |

### `Thinking` = `TextThinking | ImageThinking | UnknownThinking`

| Variante | Forma | Validación al cargar (`parseThinkings`) |
|----------|-------|------------------------------------------|
| `TextThinking` | `{ id, type: "text", value: string }` | `value` es texto. |
| `ImageThinking` | `{ id, type: "image", value: ImageRef[], text? }` | De 1 a 5 referencias, no vacías y únicas; `text` es texto si existe. |
| `UnknownThinking` | `{ id, type, ...resto }` | Se conserva entero. |
| formato viejo | `string` | Se convierte en `TextThinking` con un id nuevo (`migrated = true`). |
| inválido | cualquier otra cosa | Se descarta con `console.warn` (`migrated = true`). |
| id repetido | — | El repetido recibe un id nuevo (`migrated = true`). |

En esta etapa solo se **crean y editan** thinkings de texto. Los de imagen y los
desconocidos se cargan y se vuelven a guardar intactos.

### Estados

- `IsLoggedType = "online" | "offline" | "loading"`: arranca en `"loading"` y en esta etapa
  pasa siempre a `"offline"` después de montar (FR-016).
- `WaitingResponseType`: el mismo conjunto que en la app Vite. En esta etapa solo se usa
  `"gettingNotes"` (carga inicial) y `"none"`. El estado de las escrituras (crear, guardar,
  borrar, reordenar) se expone con `loadingSaveNote` (ver contracts/notes-context.md,
  sección "Pendiente").

## Esquema SQLite (`thinking-notes.db`)

Migración `user_version` 0 → 1:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  thinkings  TEXT NOT NULL DEFAULT '[]',  -- JSON: Thinking[] (o formato viejo)
  created_at TEXT,                          -- ISO 8601, nullable
  updated_at TEXT,                          -- ISO 8601, nullable
  position   INTEGER NOT NULL               -- orden en la lista; 0 = primera
);
PRAGMA user_version = 1;
```

- **Orden de carga**: `ORDER BY position, rowid`.
- **Posición al crear**: `COALESCE(MAX(position), -1) + 1`, así la nota va al final (como
  `[...notes, nueva]` en la app Vite).
- **Reordenar**: en una transacción, `UPDATE notes SET position = ? WHERE id = ?` para
  cada id en el orden nuevo. Las filas que no aparecen en la lista conservan su posición.
- **Guardar contenido**: un upsert
  (`INSERT … ON CONFLICT(id) DO UPDATE SET title, thinkings, updated_at`). Actualiza
  contenido y fechas, nunca `position` ni `created_at`. Si la creación había fallado, el
  upsert inserta la nota al final.
- **Borrar**: `DELETE FROM notes WHERE id = ?`.

## Mapeo fila ↔ `INotes` (`rowToNote` / `noteToRow`)

Calca `loadNotesFromStorage` de la app Vite:

| Fila | `INotes` |
|------|----------|
| `id` | `id` |
| `title` (texto o no) | `title` si es texto, si no `""` |
| `thinkings` (JSON) | `parseThinkings(JSON.parse(thinkings)).thinkings` |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` solo si son texto; si son `NULL`, el campo queda ausente |

- **Reescritura única**: si `parseThinkings` devuelve `migrated = true` para alguna nota,
  se reescribe solo la columna `thinkings` de esa nota, en una transacción, una vez por
  carga. Una carga posterior ya no detecta cambios (es idempotente).
- **JSON inválido en una fila**: se registra el error, la nota se carga con
  `thinkings: []` y **no** se reescribe (no se pisa el dato original). Esto equivale a que
  `parseThinkings` reciba algo que no es un array.

## Estado del `NotesProvider` y transiciones

| Estado | Inicial | Cambia cuando |
|--------|---------|---------------|
| `isLogged` | `"loading"` | Al montar → `"offline"`. |
| `waitingResponse` | `"none"` | `"gettingNotes"` mientras carga, después `"none"`. |
| `notes` | `[]` | Carga; crear (se agrega al final); guardar (reemplaza la nota); borrar; reordenar. |
| `activeNoteState` | `null` | `setActiveNote`, `addNote` (la nueva), `closeActiveNote` / `deleteNote` → `null`. |
| `unsavedIds` (ref interna) | vacío | Entra una nota si falla su creación o guardado; sale cuando un guardado de esa nota termina bien o cuando se borra. |
| `loadingSaveNote` (pendiente) | `false` | `true` si hay ediciones de la activa sin guardar, `unsavedIds` no vacío o una escritura en curso; `false` solo si no pasa nada de eso. |
| `saveError` | `null` | Mensaje si falla crear, guardar o borrar; se limpia cuando un guardado termina bien y no quedan notas sin guardar. |
| `loadError` | `null` | Mensaje si falla la carga inicial. |
| `reorderError` | `null` | Mensaje si falla el orden; `clearReorderError()` lo limpia. |

Ciclo del guardado de la nota activa:

```text
editar ──► pendiente (loadingSaveNote = true)
   │            │ 2 s sin cambios, o cerrar / cambiar de nota / borrar thinking
   ▼            ▼
 (más ediciones reinician el debounce)   notes[i] = snapshot (en memoria, siempre)
                                          guardar(snapshot) y luego reintentar unsavedIds
                                          ├─ ok    → updatedAt; sale de unsavedIds; si no queda nada: pendiente = false, saveError = null
                                          └─ error → entra a unsavedIds; pendiente sigue true; saveError = mensaje

crear ──► nota en notes + activa ──► createNote
                                      └─ error → entra a unsavedIds (el próximo saveNote la inserta)

borrar ──► se quita de notes ──► deleteNote
                                  └─ error → vuelve a notes en su posición; saveError = "No se pudo borrar la nota."
```
