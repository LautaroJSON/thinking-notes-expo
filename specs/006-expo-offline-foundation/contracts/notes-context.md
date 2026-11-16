# Contrato: `NotesProvider` / `useNotes`

**Ubicación**: `src/context/notes-context.ts` (tipo y contexto), `src/context/notesContext.tsx`
(proveedor) y `src/hooks/useNotes.ts`.

Mantiene la forma de la app Vite (FR-015). Se quitan las operaciones de imágenes
(`addImageThinking`, `editImageThinking`), que vuelven con su spec, y se agregan los dos
campos de error que exigen los principios I y II.

```ts
export interface NotesContextType {
  notes: INotes[];
  setNotes: (notes: INotes[]) => void;
  addNote: () => void;
  deleteNote: (id: string) => void;
  activeNoteState: INotes | null;
  setActiveNote: (id: string) => void;
  getActiveNote: () => INotes | null;
  updateActiveNote: (updates: Partial<INotes>) => void;
  closeActiveNote: () => void;
  /**
   * Hay algo sin guardar: ediciones de la nota activa, notas sin guardar
   * (creación o guardado fallido) o escrituras en curso (crear, guardar,
   * borrar, reordenar). Ver "Pendiente".
   */
  loadingSaveNote: boolean;
  setLoadingSaveNote: (value: boolean) => void;
  isLogged: IsLoggedType;
  /** Guarda ya la nota activa y reintenta las notas sin guardar. */
  saveUpdatesNotesOnDBorLocalStorage: () => void;
  waitingResponse: WaitingResponseType;
  reorderNotes: (activeId: string, overId: string) => Promise<void>;
  reorderError: string | null;
  clearReorderError: () => void;
  /** Borra un thinking de la nota activa y guarda de inmediato. */
  removeThinking: (thinkingId: string) => void;
  /** NUEVO: error de la última escritura fallida (crear, guardar o borrar); null si no hay. */
  saveError: string | null;
  /** NUEVO: error de la carga inicial; null si no hay. */
  loadError: string | null;
}

export const NotesProvider: (props: {
  children: ReactNode;
  /** Por defecto, el repositorio SQLite. Los tests inyectan uno falso. */
  repository?: NotesRepository;
  /** Por defecto, AUTOSAVE_DELAY_MS = 2000. */
  autosaveDelayMs?: number;
}) => JSX.Element;

export function useNotes(): NotesContextType; // lanza "useNotes debe usarse dentro de un NotesProvider"
```

## Notas sin guardar

El proveedor lleva internamente (en una ref) el conjunto `unsavedIds` de notas cuyo
contenido en memoria (`notes`) todavía no está en el almacenamiento.

- Una nota entra al conjunto cuando falla su creación o su guardado.
- Sale del conjunto cuando un `saveNote` de esa nota termina bien.
- Todo guardado (autosave, `saveUpdatesNotesOnDBorLocalStorage`, cambio o cierre de nota,
  `removeThinking`) guarda primero la nota activa si tiene ediciones y después reintenta,
  con `saveNote`, cada nota del conjunto, en el orden de la lista. `saveNote` es un upsert,
  así que también crea las notas cuya creación falló.

## Pendiente (`loadingSaveNote`)

`loadingSaveNote` es `true` mientras se cumpla alguna de estas condiciones, y `false` solo
cuando no se cumple ninguna:

- La nota activa tiene ediciones posteriores al último snapshot guardado.
- `unsavedIds` no está vacío.
- Hay alguna escritura del repositorio en curso (`createNote`, `saveNote`, `deleteNote`,
  `saveOrder`).

Así crear, borrar y reordenar también muestran estado mientras se escriben (principio II).
`waitingResponse` se usa solo para la carga inicial (`"gettingNotes"`), como en la app Vite
sin sesión.

## Comportamiento (modo sin sesión)

| Operación | Efecto en memoria | Persistencia | Si la persistencia falla |
|-----------|-------------------|--------------|---------------------------|
| montar | `isLogged` `loading` → `offline`; `waitingResponse = "gettingNotes"` | `loadNotes()` | `notes = []`, `loadError = "No se pudieron cargar las notas."`, no escribe nada |
| `addNote()` | Nota `{ id: newId(), title: "Nueva Nota :)", thinkings: [], createdAt = updatedAt = ahora }` al final y activa | `createNote` | La nota queda en pantalla; entra a `unsavedIds`; `saveError = "No se pudieron guardar los cambios."`; se reintenta en el siguiente guardado |
| `updateActiveNote(u)` | Mezcla `u` en la nota activa; pendiente | Debounce de `autosaveDelayMs` → guardado | Ver "Guardado" |
| `removeThinking(id)` | Quita el thinking de la nota activa; pendiente | Guardado inmediato | Ver "Guardado" |
| `setActiveNote(id)` / `closeActiveNote()` | Si la activa tiene ediciones, **primero** copia su snapshot a `notes` (en memoria, haya éxito o no); después cambia o quita la activa | Guardado inmediato del snapshot | Ver "Guardado": el snapshot queda en `notes` y en `unsavedIds`, así que al reabrir la nota se ven los cambios |
| `deleteNote(id)` | La quita de `notes` y de `unsavedIds`; si era la activa, la cierra **sin** guardar ediciones | `deleteNote` | La nota vuelve a `notes` en su posición anterior (`applyOrder` con el orden previo, conservando las demás notas); `saveError = "No se pudo borrar la nota."` |
| `reorderNotes(a, b)` | `moveNote`; si es no-op, no hace nada | `saveOrder` | `applyOrder(prev, ordenAnterior)` y `reorderError = "No se pudo guardar el orden de las notas."` |

## Guardado

Se guarda un snapshot de la nota con `saveNote`:

- **Éxito**:
  - La nota en `notes` se reemplaza por el snapshot con `updatedAt = ahora`.
  - Si es la activa, recibe solo `updatedAt`, porque puede tener ediciones más nuevas.
  - Sale de `unsavedIds` y se limpia `saveError` si no quedan notas sin guardar.
- **Error**:
  - El snapshot queda en `notes` y la nota entra a `unsavedIds`.
  - `saveError = "No se pudieron guardar los cambios."` y la pantalla sigue en pendiente.
  - El siguiente guardado (de cualquier tipo) la reintenta.

La identidad de `saveUpdatesNotesOnDBorLocalStorage` es estable, como en la app Vite
(test "mantiene estable la identidad").

## Invariantes

- Ninguna operación cambia el orden de los thinkings dentro de una nota (FR-014).
- Reordenar no cambia `updatedAt`.
- Lo que el usuario escribió nunca sale de memoria por una falla de escritura (FR-007).
  Solo `deleteNote` exitoso lo quita.
- Ninguna falla de escritura es silenciosa (FR-011b): siempre deja `saveError` o
  `reorderError`.
- Ninguna operación de esta etapa usa red, sesión ni APIs de una sola plataforma.
