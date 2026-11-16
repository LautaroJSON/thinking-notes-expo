import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { INotes, IsLoggedType, WaitingResponseType } from "@/types";
import { applyOrder, moveNote } from "@/components/utils/reorder";
import { useDebounce } from "@/hooks/useDebounce";
import { newId } from "@/lib/id";
import type { NotesRepository, StoredNote } from "@/services/notes/repository";
import { createDefaultNotesRepository } from "@/services/notes/sqliteNotesRepository";
import { resolveSessionMode } from "@/services/session";
import { NotesContext } from "./notes-context";

// Contrato: specs/006-expo-offline-foundation/contracts/notes-context.md

/** Espera sin cambios antes del guardado automático (igual que el editor de la app Vite). */
export const AUTOSAVE_DELAY_MS = 2000;
export const LOAD_ERROR_MESSAGE = "No se pudieron cargar las notas.";
export const SAVE_ERROR_MESSAGE = "No se pudieron guardar los cambios.";
export const DELETE_ERROR_MESSAGE = "No se pudo borrar la nota.";
export const REORDER_ERROR_MESSAGE = "No se pudo guardar el orden de las notas.";

const NEW_NOTE_TITLE = "Nueva Nota :)";

// Se crea una sola vez; no abre la base hasta que se usa.
const defaultRepository = createDefaultNotesRepository();

const idsOf = (notes: INotes[]): string[] =>
  notes.flatMap((note) => (note.id ? [note.id] : []));

const withId = (note: INotes): StoredNote | null =>
  note.id ? { ...note, id: note.id } : null;

export const NotesProvider = ({
  children,
  repository = defaultRepository,
  autosaveDelayMs = AUTOSAVE_DELAY_MS,
}: {
  children: ReactNode;
  /** Por defecto, el repositorio SQLite. Los tests inyectan uno falso. */
  repository?: NotesRepository;
  autosaveDelayMs?: number;
}) => {
  const [notes, setNotesState] = useState<INotes[]>([]);
  const [activeNoteState, setActiveNoteState] = useState<INotes | null>(null);
  const [isLogged, setIsLogged] = useState<IsLoggedType>("loading");
  const [waitingResponse, setWaitingResponse] =
    useState<WaitingResponseType>("none");
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Espejos en estado de las refs de abajo, para renderizar
  const [activeDirty, setActiveDirty] = useState(false);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [manualPending, setManualPending] = useState(false);

  // Fuente de verdad síncrona: varias acciones seguidas en el mismo tick (por
  // ejemplo, editar y cerrar la nota) ven siempre el último valor, y las
  // funciones de guardado tienen identidad estable.
  const notesRef = useRef<INotes[]>([]);
  const activeRef = useRef<INotes | null>(null);
  /** La nota activa tiene ediciones que todavía no se mandaron a guardar. */
  const activeDirtyRef = useRef(false);
  /** Notas cuyo contenido en memoria todavía no está en el almacenamiento. */
  const unsavedIdsRef = useRef(new Set<string>());
  const repositoryRef = useRef(repository);
  useLayoutEffect(() => {
    repositoryRef.current = repository;
  }, [repository]);

  const updateNotes = useCallback((update: (prev: INotes[]) => INotes[]) => {
    notesRef.current = update(notesRef.current);
    setNotesState(notesRef.current);
  }, []);

  const setNotes = useCallback(
    (next: INotes[]) => updateNotes(() => next),
    [updateNotes],
  );

  const setActive = useCallback((next: INotes | null) => {
    activeRef.current = next;
    setActiveNoteState(next);
  }, []);

  const setDirty = useCallback((value: boolean) => {
    activeDirtyRef.current = value;
    setActiveDirty(value);
  }, []);

  const markUnsaved = useCallback((id: string) => {
    unsavedIdsRef.current.add(id);
    setUnsavedCount(unsavedIdsRef.current.size);
  }, []);

  const markSaved = useCallback((id: string) => {
    unsavedIdsRef.current.delete(id);
    setUnsavedCount(unsavedIdsRef.current.size);
    if (unsavedIdsRef.current.size === 0) setSaveError(null);
  }, []);

  /** Cuenta una escritura en curso mientras dura la promesa. */
  const track = useCallback(<T,>(write: Promise<T>): Promise<T> => {
    setPendingWrites((n) => n + 1);
    return write.finally(() => setPendingWrites((n) => n - 1));
  }, []);

  // Sesión y carga inicial. En esta etapa la sesión siempre resuelve a "sin
  // sesión" (FR-016); la spec 007 cambia resolveSessionMode y el repositorio.
  useEffect(() => {
    let cancelled = false;
    const loadLocalNotes = async () => {
      setWaitingResponse("gettingNotes");
      try {
        const loaded = await repositoryRef.current.loadNotes();
        if (cancelled) return;
        setNotes(loaded);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        // Nada se escribe: lo guardado queda intacto (FR-007)
        console.error("Error cargando las notas locales:", error);
        setNotes([]);
        setLoadError(LOAD_ERROR_MESSAGE);
      } finally {
        if (!cancelled) setWaitingResponse("none");
      }
    };

    void resolveSessionMode().then((mode) => {
      if (cancelled) return;
      setIsLogged(mode);
      if (mode === "offline") return loadLocalNotes();
    });
    return () => {
      cancelled = true;
    };
  }, [setNotes]);

  /** Guarda una nota; si falla, queda marcada como sin guardar. */
  const persistNote = useCallback(
    async (note: StoredNote) => {
      try {
        await track(repositoryRef.current.saveNote(note));
        markSaved(note.id);
        // Solo la fecha: la nota activa puede tener ediciones más nuevas
        const active = activeRef.current;
        if (active?.id === note.id) {
          setActive({ ...active, updatedAt: note.updatedAt });
        }
      } catch (error) {
        console.error("Error guardando la nota:", error);
        markUnsaved(note.id);
        setSaveError(SAVE_ERROR_MESSAGE);
      }
    },
    [track, markSaved, markUnsaved, setActive],
  );

  /**
   * Si la nota activa tiene ediciones, toma una copia con la fecha de
   * modificación nueva y la deja en `notes` en memoria antes de guardarla:
   * así, aunque el guardado falle, lo escrito no se pierde al cambiar de nota.
   */
  const snapshotActive = useCallback((): StoredNote | null => {
    const active = activeRef.current;
    if (!active?.id || !activeDirtyRef.current) return null;
    const snapshot: StoredNote = {
      ...active,
      id: active.id,
      updatedAt: new Date().toISOString(),
    };
    setDirty(false);
    markUnsaved(snapshot.id);
    updateNotes((prev) =>
      prev.map((note) => (note.id === snapshot.id ? snapshot : note)),
    );
    return snapshot;
  }, [setDirty, markUnsaved, updateNotes]);

  /** Guarda la nota activa (si tiene ediciones) y reintenta las sin guardar. */
  const flushAll = useCallback(async () => {
    const snapshot = snapshotActive();
    const pending: StoredNote[] = snapshot ? [snapshot] : [];
    for (const id of unsavedIdsRef.current) {
      if (id === snapshot?.id) continue;
      const note = notesRef.current.find((n) => n.id === id);
      const stored = note ? withId(note) : null;
      if (stored) pending.push(stored);
    }
    await Promise.all(pending.map(persistNote));
  }, [snapshotActive, persistNote]);

  const saveUpdatesNotesOnDBorLocalStorage = useCallback(() => {
    setManualPending(false);
    void flushAll();
  }, [flushAll]);

  // Guardado automático: cuando la nota activa deja de cambiar durante
  // `autosaveDelayMs` y tiene ediciones sin guardar.
  const debouncedActiveNote = useDebounce(activeNoteState, autosaveDelayMs);
  useEffect(() => {
    if (debouncedActiveNote && activeDirtyRef.current) {
      saveUpdatesNotesOnDBorLocalStorage();
    }
  }, [debouncedActiveNote, saveUpdatesNotesOnDBorLocalStorage]);

  const addNote = async () => {
    void flushAll();
    const now = new Date().toISOString();
    const newNote: StoredNote = {
      id: newId(),
      title: NEW_NOTE_TITLE,
      thinkings: [],
      createdAt: now,
      updatedAt: now,
    };
    updateNotes((prev) => [...prev, newNote]);
    setActive(newNote);
    markUnsaved(newNote.id);
    try {
      await track(repositoryRef.current.createNote(newNote));
      markSaved(newNote.id);
    } catch (error) {
      // Queda sin guardar: el próximo guardado la inserta (upsert)
      console.error("Error creando la nota:", error);
      setSaveError(SAVE_ERROR_MESSAGE);
    }
  };

  const deleteNote = async (id: string) => {
    const previousNotes = notesRef.current;
    const previousOrder = idsOf(previousNotes);
    const active = activeRef.current;
    const wasActive = active?.id === id;
    const wasUnsaved =
      unsavedIdsRef.current.has(id) || (wasActive && activeDirtyRef.current);
    const removed = wasActive
      ? active
      : previousNotes.find((note) => note.id === id);

    updateNotes((prev) => prev.filter((note) => note.id !== id));
    if (wasActive) {
      setDirty(false);
      setActive(null);
    }
    if (unsavedIdsRef.current.has(id)) markSaved(id);

    try {
      await track(repositoryRef.current.deleteNote(id));
    } catch (error) {
      // La nota vuelve a su lugar, sin perder lo que tenía
      console.error("Error borrando la nota:", error);
      if (removed) {
        updateNotes((prev) => applyOrder([...prev, removed], previousOrder));
        if (wasUnsaved) markUnsaved(id);
      }
      setSaveError(DELETE_ERROR_MESSAGE);
    }
  };

  const reorderNotes = async (activeId: string, overId: string) => {
    const current = notesRef.current;
    const nextNotes = moveNote(current, activeId, overId);
    // Soltar en la misma posición (o ids inexistentes): nada que guardar
    if (nextNotes === current) return;

    const previousOrder = idsOf(current);
    setReorderError(null);
    updateNotes(() => nextNotes);

    try {
      await track(repositoryRef.current.saveOrder(idsOf(nextNotes)));
    } catch (error) {
      // Vuelve al orden anterior sin descartar cambios de contenido
      console.error("Error guardando el orden de las notas:", error);
      updateNotes((prev) => applyOrder(prev, previousOrder));
      setReorderError(REORDER_ERROR_MESSAGE);
    }
  };

  // Identidad estable, como en la app Vite
  const clearReorderError = useCallback(() => {
    setReorderError(null);
  }, []);

  const setActiveNote = (id: string) => {
    if (activeRef.current?.id === id) return;
    void flushAll();
    setActive(notesRef.current.find((note) => note.id === id) ?? null);
  };

  const getActiveNote = (): INotes | null => activeRef.current;

  const updateActiveNote = (updates: Partial<INotes>) => {
    const current = activeRef.current;
    if (!current?.id) return;
    setDirty(true);
    setActive({ ...current, ...updates });
  };

  const closeActiveNote = () => {
    void flushAll();
    setActive(null);
  };

  /** Borra un pensamiento de la nota activa y guarda de inmediato. */
  const removeThinking = (thinkingId: string) => {
    const current = activeRef.current;
    if (!current?.id || !current.thinkings.some((t) => t.id === thinkingId)) {
      return;
    }
    setDirty(true);
    setActive({
      ...current,
      thinkings: current.thinkings.filter((t) => t.id !== thinkingId),
    });
    void flushAll();
  };

  const loadingSaveNote =
    activeDirty || unsavedCount > 0 || pendingWrites > 0 || manualPending;

  return (
    <NotesContext.Provider
      value={{
        notes,
        setNotes,
        addNote,
        deleteNote,
        setActiveNote,
        getActiveNote,
        activeNoteState,
        updateActiveNote,
        closeActiveNote,
        loadingSaveNote,
        setLoadingSaveNote: setManualPending,
        isLogged,
        saveUpdatesNotesOnDBorLocalStorage,
        waitingResponse,
        reorderNotes,
        reorderError,
        clearReorderError,
        removeThinking,
        saveError,
        loadError,
      }}
    >
      {children}
    </NotesContext.Provider>
  );
};
