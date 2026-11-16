import type { INotes } from "@/types";

/** Valores que se pueden pasar como parámetros de una consulta. */
export type SqlValue = string | number | null;

/**
 * La parte de `SQLiteDatabase` (expo-sqlite) que usa el repositorio, con los
 * parámetros siempre como array. La base real la cumple tal cual; en los
 * tests la implementa un adaptador sobre `node:sqlite`.
 */
export interface NotesDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Nota que ya tiene id (todas las notas que se guardan). */
export type StoredNote = INotes & { id: string };

/**
 * Única puerta entre la lógica de notas y el almacenamiento. En esta etapa
 * hay una implementación local (SQLite); el modo con sesión (spec 007) aporta
 * otra con este mismo contrato. Ver specs/006-expo-offline-foundation/contracts.
 */
export interface NotesRepository {
  /** Notas en el orden de la lista, ya normalizadas. */
  loadNotes(): Promise<INotes[]>;
  /** Persiste una nota nueva al final de la lista. */
  createNote(note: StoredNote): Promise<INotes>;
  /** Guarda título, thinkings y updatedAt; si no existía, la crea al final. */
  saveNote(note: StoredNote): Promise<INotes>;
  deleteNote(id: string): Promise<void>;
  /** Fija el orden de la lista; los ids desconocidos se ignoran. */
  saveOrder(ids: string[]): Promise<void>;
}
