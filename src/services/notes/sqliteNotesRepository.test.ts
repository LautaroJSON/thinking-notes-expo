import type { INotes, Thinking } from "@/types";
import { migrateDatabase } from "./database";
import type { StoredNote } from "./repository";
import { createSqliteNotesRepository } from "./sqliteNotesRepository";
import {
  createNodeSqliteDatabase,
  type NodeSqliteDatabase,
} from "./testing/nodeSqliteDatabase";

const setup = async () => {
  const db = createNodeSqliteDatabase();
  await migrateDatabase(db);
  return { db, repo: createSqliteNotesRepository(db) };
};

const note = (id: string, overrides: Partial<INotes> = {}): StoredNote => ({
  id,
  title: `Nota ${id}`,
  thinkings: [{ id: `${id}-t1`, type: "text", value: `idea de ${id}` }],
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

const rows = (db: NodeSqliteDatabase) =>
  db.raw
    .prepare(
      "SELECT id, title, created_at, updated_at, position FROM notes ORDER BY position",
    )
    .all()
    .map((r) => ({ ...(r as { id: string; position: number }) }));

describe("sqliteNotesRepository", () => {
  describe("casos felices", () => {
    it("loadNotes devuelve una lista vacía en una base nueva", async () => {
      const { repo } = await setup();
      await expect(repo.loadNotes()).resolves.toEqual([]);
    });

    it("createNote agrega cada nota al final de la lista", async () => {
      const { db, repo } = await setup();

      await repo.createNote(note("a"));
      await repo.createNote(note("b"));
      await repo.createNote(note("c"));

      expect(rows(db).map((r) => r.position)).toEqual([0, 1, 2]);
      const loaded = await repo.loadNotes();
      expect(loaded.map((n) => n.id)).toEqual(["a", "b", "c"]);
      expect(loaded[0]).toEqual(note("a"));
    });

    it("saveNote actualiza título, thinkings y updatedAt sin tocar posición ni createdAt", async () => {
      const { db, repo } = await setup();
      await repo.createNote(note("a"));
      await repo.createNote(note("b"));

      const edited = note("a", {
        title: "Editada",
        thinkings: [{ id: "x", type: "text", value: "nueva" }],
        createdAt: "2030-01-01T00:00:00.000Z", // no debe pisar la original
        updatedAt: "2026-11-02T12:00:00.000Z",
      });
      await expect(repo.saveNote(edited)).resolves.toEqual(edited);

      const [a] = await repo.loadNotes();
      expect(a).toEqual({
        ...edited,
        createdAt: "2026-11-01T10:00:00.000Z",
      });
      expect(rows(db).map((r) => [r.id, r.position])).toEqual([
        ["a", 0],
        ["b", 1],
      ]);
    });

    it("saveNote de una nota inexistente la inserta al final", async () => {
      const { repo } = await setup();
      await repo.createNote(note("a"));

      await repo.saveNote(note("nueva"));

      expect((await repo.loadNotes()).map((n) => n.id)).toEqual([
        "a",
        "nueva",
      ]);
    });

    it("deleteNote borra la nota y no falla con ids inexistentes", async () => {
      const { repo } = await setup();
      await repo.createNote(note("a"));
      await repo.createNote(note("b"));

      await repo.deleteNote("a");
      await expect(repo.deleteNote("no-existe")).resolves.toBeUndefined();

      expect((await repo.loadNotes()).map((n) => n.id)).toEqual(["b"]);
    });

    it("conserva intactos los thinkings de imagen y de tipo desconocido", async () => {
      const { repo } = await setup();
      const thinkings: Thinking[] = [
        { id: "t", type: "text", value: "texto" },
        { id: "i", type: "image", value: ["local:a", "local:b"], text: "pie" },
        { id: "u", type: "audio", ref: "x", extra: 1 },
      ];

      await repo.createNote(note("a", { thinkings }));

      expect((await repo.loadNotes())[0].thinkings).toEqual(thinkings);
    });

    it("omite las fechas ausentes", async () => {
      const { repo } = await setup();
      const { createdAt: _c, updatedAt: _u, ...withoutDates } = note("a");

      await repo.createNote(withoutDates);

      const [loaded] = await repo.loadNotes();
      expect(loaded).toEqual(withoutDates);
      expect("createdAt" in loaded).toBe(false);
    });

    it("otra instancia sobre la misma base lee lo mismo (persistencia)", async () => {
      const { db, repo } = await setup();
      await repo.createNote(note("a"));
      await repo.saveNote(note("a", { title: "Guardada" }));

      const other = createSqliteNotesRepository(db);

      expect(await other.loadNotes()).toEqual([
        note("a", { title: "Guardada" }),
      ]);
    });
  });
});
