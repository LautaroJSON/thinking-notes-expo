import { migrateDatabase } from "./database";
import { createNodeSqliteDatabase } from "./testing/nodeSqliteDatabase";

const columns = (db: ReturnType<typeof createNodeSqliteDatabase>) =>
  db.raw
    .prepare("PRAGMA table_info(notes)")
    .all()
    .map((c) => (c as { name: string }).name);

const userVersion = (db: ReturnType<typeof createNodeSqliteDatabase>) =>
  (db.raw.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;

describe("migrateDatabase", () => {
  it("crea la tabla notes con sus columnas y fija user_version = 1", async () => {
    const db = createNodeSqliteDatabase();

    await migrateDatabase(db);

    expect(columns(db)).toEqual([
      "id",
      "title",
      "thinkings",
      "created_at",
      "updated_at",
      "position",
    ]);
    expect(userVersion(db)).toBe(1);
  });

  it("es idempotente y no borra datos al correr otra vez", async () => {
    const db = createNodeSqliteDatabase();
    await migrateDatabase(db);
    db.raw
      .prepare("INSERT INTO notes (id, title, position) VALUES (?, ?, ?)")
      .run("n1", "Hola", 0);

    await migrateDatabase(db);

    expect(userVersion(db)).toBe(1);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM notes").get()).toEqual(
      expect.objectContaining({ n: 1 }),
    );
  });
});
