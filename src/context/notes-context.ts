import { createContext } from "react";
import type { INotes, IsLoggedType, WaitingResponseType } from "../types";

// Contrato: specs/006-expo-offline-foundation/contracts/notes-context.md
export interface NotesContextType {
  notes: INotes[];
  addNote: () => void;
  setNotes: (notes: INotes[]) => void;
  deleteNote: (id: string) => void;
  activeNoteState: INotes | null;
  setActiveNote: (id: string) => void;
  getActiveNote: () => INotes | null;
  updateActiveNote: (updates: Partial<INotes>) => void;
  closeActiveNote: () => void;
  /**
   * Hay algo sin guardar: ediciones de la nota activa, notas cuya creación o
   * guardado falló, o escrituras en curso (crear, guardar, borrar, reordenar).
   */
  loadingSaveNote: boolean;
  setLoadingSaveNote: (value: boolean) => void;
  isLogged: IsLoggedType;
  /** Guarda ya la nota activa y reintenta las notas sin guardar. */
  saveUpdatesNotesOnDBorLocalStorage: () => void;
  waitingResponse: WaitingResponseType;
  /** Mueve la nota `activeId` a la posición de `overId` y guarda el orden. */
  reorderNotes: (activeId: string, overId: string) => Promise<void>;
  /** Error del último guardado de orden fallido; `null` si no hay. */
  reorderError: string | null;
  clearReorderError: () => void;
  /** Borra un pensamiento de la nota activa y guarda de inmediato. */
  removeThinking: (thinkingId: string) => void;
  /** Error de la última escritura fallida (crear, guardar o borrar). */
  saveError: string | null;
  /** Error de la carga inicial de notas. */
  loadError: string | null;
}

export const NotesContext = createContext<NotesContextType | undefined>(
  undefined,
);
