import type { INotes } from "@/types";
import { parseThinkings } from "@/types/thinking";
import { getDatabase } from "./database";
import type {
  NotesDatabase,
  NotesRepository,
  SqlValue,
  StoredNote,
} from "./repository";

interface NoteRow {
  id: string;
  title: unknown;
  thinkings: unknown;
  created_at: unknown;
  updated_at: unknown;
}

const optionalString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/**
 * Convierte una fila en nota con la misma normalización que hacía la carga
 * desde localStorage en la app Vite. `migrated` indica que los thinkings
 * cambiaron y hay que reescribirlos; nunca es true si el JSON era inválido
 * (así no se pisa el dato original).
 */
export const rowToNote = (row: NoteRow): { note: INotes; migrated: boolean } => {
  let rawThinkings: unknown = [];
  let validJson = true;
  try {
    rawThinkings =
      typeof row.thinkings === "string" ? JSON.parse(row.thinkings) : [];
  } catch (error) {
    validJson = false;
    console.error(`Thinkings con JSON inválido en la nota ${row.id}:`, error);
  }

  const { thinkings, migrated } = parseThinkings(rawThinkings);
  const note: INotes = {
    id: row.id,
    title: typeof row.title === "string" ? row.title : "",
    thinkings,
  };
  const createdAt = optionalString(row.created_at);
  if (createdAt !== undefined) note.createdAt = createdAt;
  const updatedAt = optionalString(row.updated_at);
  if (updatedAt !== undefined) note.updatedAt = updatedAt;

  return { note, migrated: validJson && migrated };
};

const noteParams = (note: StoredNote): SqlValue[] => [
  note.id,
  note.title,
  JSON.stringify(note.thinkings),
  note.createdAt ?? null,
  note.updatedAt ?? null,
];

const NEXT_POSITION = "(SELECT COALESCE(MAX(position), -1) + 1 FROM notes)";

const INSERT_NOTE = `
  INSERT INTO notes (id, title, thinkings, created_at, updated_at, position)
  VALUES (?, ?, ?, ?, ?, ${NEXT_POSITION})`;

// Upsert: actualiza contenido y fecha de modificación; nunca la posición ni
// la fecha de creación. Si la nota no existía (su creación falló), la inserta
// al final.
const UPSERT_NOTE = `${INSERT_NOTE}
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    thinkings = excluded.thinkings,
    updated_at = excluded.updated_at`;

export const createSqliteNotesRepository = (
  db: NotesDatabase,
): NotesRepository => {
  // Las escrituras corren de a una y en orden: withTransactionAsync no es
  // exclusiva en web. Una escritura que falla no corta la cola.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(write: () => Promise<T>): Promise<T> => {
    const run = queue.then(write);
    queue = run.catch(() => undefined);
    return run;
  };

  const rewriteThinkings = (notes: INotes[]) =>
    enqueue(() =>
      db.withTransactionAsync(async () => {
        for (const note of notes) {
          await db.runAsync("UPDATE notes SET thinkings = ? WHERE id = ?", [
            JSON.stringify(note.thinkings),
            note.id ?? null,
          ]);
        }
      }),
    );

  return {
    async loadNotes() {
      const rows = await db.getAllAsync<NoteRow>(
        `SELECT id, title, thinkings, created_at, updated_at
         FROM notes ORDER BY position, rowid`,
        [],
      );
      const parsed = rows.map(rowToNote);
      const notes = parsed.map((p) => p.note);
      const migrated = parsed.filter((p) => p.migrated).map((p) => p.note);

      if (migrated.length > 0) {
        // Se reescribe una sola vez; si falla, se reintenta en la próxima carga
        try {
          await rewriteThinkings(migrated);
        } catch (error) {
          console.error("No se pudo reescribir el formato de las notas:", error);
        }
      }
      return notes;
    },

    createNote(note) {
      return enqueue(async () => {
        await db.runAsync(INSERT_NOTE, noteParams(note));
        return note;
      });
    },

    saveNote(note) {
      return enqueue(async () => {
        await db.runAsync(UPSERT_NOTE, noteParams(note));
        return note;
      });
    },

    deleteNote(id) {
      return enqueue(async () => {
        await db.runAsync("DELETE FROM notes WHERE id = ?", [id]);
      });
    },

    saveOrder(ids) {
      return enqueue(() =>
        db.withTransactionAsync(async () => {
          for (const [position, id] of ids.entries()) {
            await db.runAsync("UPDATE notes SET position = ? WHERE id = ?", [
              position,
              id,
            ]);
          }
        }),
      );
    },
  };
};

/**
 * Repositorio de la app: abre la base local la primera vez que se usa y
 * delega en el repositorio SQLite (uno solo, para compartir la cola).
 */
export const createDefaultNotesRepository = (
  open: () => Promise<NotesDatabase> = getDatabase,
): NotesRepository => {
  let repository: Promise<NotesRepository> | null = null;
  const get = () => {
    if (!repository) {
      repository = open()
        .then(createSqliteNotesRepository)
        .catch((error: unknown) => {
          repository = null;
          throw error;
        });
    }
    return repository;
  };

  return {
    loadNotes: async () => (await get()).loadNotes(),
    createNote: async (note) => (await get()).createNote(note),
    saveNote: async (note) => (await get()).saveNote(note),
    deleteNote: async (id) => (await get()).deleteNote(id),
    saveOrder: async (ids) => (await get()).saveOrder(ids),
  };
};
