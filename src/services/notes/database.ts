import { openDatabaseAsync } from "expo-sqlite";
import type { NotesDatabase } from "./repository";

export const DATABASE_NAME = "thinking-notes.db";

/** Versión del esquema; cada migración nueva la incrementa. */
export const DATABASE_VERSION = 1;

/**
 * Aplica las migraciones pendientes según `PRAGMA user_version`.
 * Es idempotente: si la base ya está al día, no hace nada.
 */
export const migrateDatabase = async (db: NotesDatabase): Promise<void> => {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
    [],
  );
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (currentVersion < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS notes (
          id         TEXT PRIMARY KEY NOT NULL,
          title      TEXT NOT NULL DEFAULT '',
          thinkings  TEXT NOT NULL DEFAULT '[]',
          created_at TEXT,
          updated_at TEXT,
          position   INTEGER NOT NULL
        );
      `);
    }
    // Futuras migraciones: if (currentVersion < 2) { ... }
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
};

let databasePromise: Promise<NotesDatabase> | null = null;

/**
 * Abre la base local una sola vez y la deja migrada. Si la apertura falla,
 * el próximo llamado vuelve a intentar.
 */
export const getDatabase = (): Promise<NotesDatabase> => {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db: NotesDatabase = await openDatabaseAsync(DATABASE_NAME);
      await migrateDatabase(db);
      return db;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};
