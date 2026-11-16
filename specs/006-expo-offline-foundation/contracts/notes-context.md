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
  /** Hay cambios de la nota activa sin guardar (o el último guardado falló). */
  loadingSaveNote: boolean;
  setLoadingSaveNote: (value: boolean) => void;
  isLogged: IsLoggedType;
  /** Guarda ya la nota activa (lo que hacía el debounce del editor en la app Vite). */
  saveUpdatesNotesOnDBorLocalStorage: () => void;
  waitingResponse: WaitingResponseType;
  reorderNotes: (activeId: string, overId: string) => Promise<void>;
  reorderError: string | null;
  clearReorderError: () => void;
  /** Borra un thinking de la nota activa y guarda de inmediato. */
  removeThinking: (thinkingId: string) => void;
  /** NUEVO: error del último guardado; null si no hay. */
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

## Comportamiento (modo sin sesión)

| Operación | Efecto en memoria | Persistencia | Si la persistencia falla |
|-----------|-------------------|--------------|---------------------------|
| montar | `isLogged` `loading` → `offline`; `waitingResponse = "gettingNotes"` | `loadNotes()` | `notes = []`, `loadError = "No se pudieron cargar las notas."`, no escribe nada |
| `addNote()` | Nota `{ id: newId(), title: "Nueva Nota :)", thinkings: [], createdAt = updatedAt = ahora }` al final y activa | `createNote` | La nota queda en pantalla; `console.error` (como la app Vite). El siguiente `saveNote` la crea. |
| `updateActiveNote(u)` | Mezcla `u` en la nota activa; pendiente = true | Debounce de `autosaveDelayMs` → `saveNote` | Ver "Guardado" |
| `removeThinking(id)` | Quita el thinking de la nota activa; pendiente = true | Inmediato | Ver "Guardado" |
| `setActiveNote(id)` / `closeActiveNote()` | Cambia o quita la activa | Si hay pendiente, guarda **antes** la nota que se deja | Ver "Guardado" (el error queda en `saveError`) |
| `deleteNote(id)` | La quita de `notes`; si era la activa, la cierra **sin** guardar pendientes | `deleteNote` | La lista sigue sin la nota; `console.error` |
| `reorderNotes(a, b)` | `moveNote`; si es no-op, no hace nada | `saveOrder` | `applyOrder(prev, ordenAnterior)` y `reorderError = "No se pudo guardar el orden de las notas."` |

**Guardado** (`saveNote` con un snapshot de la nota):

- Éxito: la nota en `notes` se reemplaza por el snapshot con `updatedAt = ahora`. La nota
  activa recibe solo `updatedAt`, porque puede tener ediciones más nuevas. `saveError = null`.
  `loadingSaveNote` pasa a `false` **solo si** no hubo ediciones después de tomar el snapshot.
- Error: `loadingSaveNote` sigue en `true`, `saveError = "No se pudieron guardar los cambios."`
  y el contenido queda en memoria. La siguiente edición o el siguiente cambio de nota
  reintentan.
- La identidad de `saveUpdatesNotesOnDBorLocalStorage` es estable, como en la app Vite
  (test "mantiene estable la identidad").

**Invariantes**:

- Ninguna operación cambia el orden de los thinkings dentro de una nota (FR-014).
- Reordenar no cambia `updatedAt`.
- Ninguna operación de esta etapa usa red, sesión ni APIs de una sola plataforma.
