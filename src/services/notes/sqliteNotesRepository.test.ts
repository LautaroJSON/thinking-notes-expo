import type { INotes, Thinking } from "@/types";
import { migrateDatabase } from "./database";
import type { StoredNote } from "./repository";
import { createSqliteNotesRepository } from "./sqliteNotesRepository";
import {
  createFailingDatabase,
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
    .map((r) => ({ ...(r as { id: string; position: number; updated_at: string | null }) }));

describe("sqliteNotesRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  describe("saveOrder (US2)", () => {
    const seed = async () => {
      const ctx = await setup();
      for (const id of ["a", "b", "c"]) await ctx.repo.createNote(note(id));
      return ctx;
    };

    it("guarda el orden nuevo de la lista", async () => {
      const { repo } = await seed();

      await repo.saveOrder(["c", "a", "b"]);

      expect((await repo.loadNotes()).map((n) => n.id)).toEqual([
        "c",
        "a",
        "b",
      ]);
    });

    it("ignora ids desconocidos", async () => {
      const { repo } = await seed();

      await repo.saveOrder(["b", "x", "a", "c"]);

      expect((await repo.loadNotes()).map((n) => n.id)).toEqual([
        "b",
        "a",
        "c",
      ]);
    });

    it("no cambia la fecha de modificación", async () => {
      const { db, repo } = await seed();

      await repo.saveOrder(["c", "b", "a"]);

      expect(new Set(rows(db).map((r) => r.updated_at))).toEqual(
        new Set(["2026-11-01T10:00:00.000Z"]),
      );
    });

    it("si falla a mitad de la transacción, el orden guardado queda como estaba", async () => {
      const { db } = await seed();
      // La 2.ª escritura del reordenamiento falla
      const failing = createFailingDatabase(db, { failOnWriteNumber: 2 });
      const repo = createSqliteNotesRepository(failing);

      await expect(repo.saveOrder(["c", "a", "b"])).rejects.toThrow(
        "Falla simulada",
      );

      expect((await repo.loadNotes()).map((n) => n.id)).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("normalización al cargar (US3, igual que loadNotesFromStorage)", () => {
    /** Inserta una fila a mano, con el JSON de thinkings tal cual. */
    const insertRaw = (
      db: NodeSqliteDatabase,
      row: {
        id: string;
        title?: string | null;
        thinkings: string;
        created_at?: string | null;
        updated_at?: string | null;
        position: number;
      },
    ) =>
      db.raw
        .prepare(
          `INSERT INTO notes (id, title, thinkings, created_at, updated_at, position)
           VALUES (?, COALESCE(?, ''), ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.title ?? null,
          row.thinkings,
          row.created_at ?? null,
          row.updated_at ?? null,
          row.position,
        );

    const storedThinkings = (db: NodeSqliteDatabase, id: string): unknown =>
      JSON.parse(
        (
          db.raw.prepare("SELECT thinkings FROM notes WHERE id = ?").get(id) as {
            thinkings: string;
          }
        ).thinkings,
      );

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it("migra el formato viejo (string[]) y reescribe una sola vez", async () => {
      const { db, repo } = await setup();
      insertRaw(db, { id: "1", title: "Vieja", thinkings: '["a","b"]', position: 0 });
      insertRaw(db, { id: "2", title: "Vacía", thinkings: "[]", position: 1 });
      const runAsync = jest.spyOn(db, "runAsync");

      const notes = await repo.loadNotes();

      expect(notes[0].thinkings).toEqual([
        { id: expect.stringMatching(UUID_RE), type: "text", value: "a" },
        { id: expect.stringMatching(UUID_RE), type: "text", value: "b" },
      ]);
      expect(notes[1].thinkings).toEqual([]);
      // Solo se reescribe la nota que cambió
      expect(runAsync).toHaveBeenCalledTimes(1);
      expect(storedThinkings(db, "1")).toEqual(notes[0].thinkings);

      // Una segunda carga no vuelve a escribir ni cambia los ids
      runAsync.mockClear();
      expect(await repo.loadNotes()).toEqual(notes);
      expect(runAsync).not.toHaveBeenCalled();
    });

    it("no reescribe thinkings que ya están en el formato nuevo", async () => {
      const { db, repo } = await setup();
      const thinkings = [
        { id: "a", type: "text", value: "a" },
        { id: "b", type: "image", value: ["local:x"], text: "b" },
      ];
      insertRaw(db, {
        id: "1",
        title: "Idea",
        thinkings: JSON.stringify(thinkings),
        position: 0,
      });
      const runAsync = jest.spyOn(db, "runAsync");

      expect(await repo.loadNotes()).toEqual([
        { id: "1", title: "Idea", thinkings },
      ]);
      expect(runAsync).not.toHaveBeenCalled();
    });

    it("descarta los thinkings inválidos con un aviso y conserva los válidos", async () => {
      const { db, repo } = await setup();
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      insertRaw(db, {
        id: "1",
        thinkings: JSON.stringify([
          null,
          3,
          { type: "text", value: "sin id" },
          { id: "i0", type: "image", value: [] },
          { id: "i6", type: "image", value: ["1", "2", "3", "4", "5", "6"] },
          { id: "t", type: "text", value: 42 },
          { id: "ok", type: "text", value: "ok" },
        ]),
        position: 0,
      });

      const [loaded] = await repo.loadNotes();

      expect(loaded.thinkings).toEqual([{ id: "ok", type: "text", value: "ok" }]);
      expect(warn).toHaveBeenCalled();
      expect(storedThinkings(db, "1")).toEqual(loaded.thinkings);
    });

    it("conserva tal cual los tipos desconocidos", async () => {
      const { db, repo } = await setup();
      const audio = { id: "x", type: "audio", value: "ref", extra: 1 };
      insertRaw(db, { id: "1", thinkings: JSON.stringify([audio]), position: 0 });

      expect((await repo.loadNotes())[0].thinkings).toEqual([audio]);
    });

    it("asigna un id nuevo a los ids repetidos", async () => {
      const { db, repo } = await setup();
      insertRaw(db, {
        id: "1",
        thinkings: JSON.stringify([
          { id: "dup", type: "text", value: "a" },
          { id: "dup", type: "text", value: "b" },
        ]),
        position: 0,
      });

      const [loaded] = await repo.loadNotes();

      expect(loaded.thinkings[0].id).toBe("dup");
      expect(loaded.thinkings[1].id).toMatch(UUID_RE);
    });

    it("título vacío y fechas nulas quedan como en la app Vite", async () => {
      const { db, repo } = await setup();
      insertRaw(db, { id: "1", title: null, thinkings: "[]", position: 0 });

      const [loaded] = await repo.loadNotes();

      expect(loaded).toEqual({ id: "1", title: "", thinkings: [] });
      expect("createdAt" in loaded).toBe(false);
      expect("updatedAt" in loaded).toBe(false);
    });

    it("con JSON inválido carga la nota sin thinkings y no pisa el dato original", async () => {
      const { db, repo } = await setup();
      const error = jest.spyOn(console, "error").mockImplementation(() => {});
      insertRaw(db, { id: "1", title: "Rota", thinkings: "{no es json", position: 0 });
      const runAsync = jest.spyOn(db, "runAsync");

      const [loaded] = await repo.loadNotes();

      expect(loaded).toEqual({ id: "1", title: "Rota", thinkings: [] });
      expect(error).toHaveBeenCalled();
      expect(runAsync).not.toHaveBeenCalled();
      expect(
        (db.raw.prepare("SELECT thinkings FROM notes").get() as { thinkings: string })
          .thinkings,
      ).toBe("{no es json");
    });
  });

  describe("fallas del almacenamiento (US4)", () => {
    it("si falla la lectura, loadNotes rechaza y no escribe nada", async () => {
      const { db } = await setup();
      const failing = createFailingDatabase(db, { failReads: true });
      const repo = createSqliteNotesRepository(failing);

      await expect(repo.loadNotes()).rejects.toThrow("Falla simulada de lectura");
      expect(failing.writeCount()).toBe(0);
    });

    it("createNote, saveNote y deleteNote rechazan con el error original sin dejar filas a medias", async () => {
      const { db, repo: ok } = await setup();
      await ok.createNote(note("a"));
      const failing = createFailingDatabase(db, { failWrites: true });
      const repo = createSqliteNotesRepository(failing);

      await expect(repo.createNote(note("b"))).rejects.toThrow(
        "Falla simulada de escritura",
      );
      await expect(
        repo.saveNote(note("a", { title: "No llega" })),
      ).rejects.toThrow("Falla simulada de escritura");
      await expect(repo.deleteNote("a")).rejects.toThrow(
        "Falla simulada de escritura",
      );

      expect(await ok.loadNotes()).toEqual([note("a")]);
    });

    it("una escritura que falla no bloquea las siguientes de la cola", async () => {
      const { db } = await setup();
      const failing = createFailingDatabase(db, { failOnWriteNumber: 1 });
      const repo = createSqliteNotesRepository(failing);

      const first = repo.createNote(note("a"));
      const second = repo.createNote(note("b"));

      await expect(first).rejects.toThrow("Falla simulada");
      await expect(second).resolves.toEqual(note("b"));
      expect((await repo.loadNotes()).map((n) => n.id)).toEqual(["b"]);
    });
  });

  it("carga 200 notas con 10 thinkings cada una, en orden (referencia de SC-005)", async () => {
    const { repo } = await setup();
    for (let i = 0; i < 200; i++) {
      await repo.createNote(
        note(`n${i}`, {
          thinkings: Array.from({ length: 10 }, (_, j) => ({
            id: `n${i}-${j}`,
            type: "text",
            value: `idea ${j}`,
          })),
        }),
      );
    }

    const started = Date.now();
    const loaded = await repo.loadNotes();
    const elapsed = Date.now() - started;

    expect(loaded).toHaveLength(200);
    expect(loaded.map((n) => n.id)).toEqual(
      Array.from({ length: 200 }, (_, i) => `n${i}`),
    );
    expect(loaded[199].thinkings).toHaveLength(10);
    // En Node es muy holgado; la medición real es en un Android (T053)
    expect(elapsed).toBeLessThan(1000);
  });
});
