// Solo para tests: implementa NotesDatabase sobre `node:sqlite` (incluido en
// Node 22.5+), así los tests del repositorio corren SQL real en memoria.
import { DatabaseSync } from "node:sqlite";
import type { NotesDatabase, SqlValue } from "../repository";

export interface NodeSqliteDatabase extends NotesDatabase {
  /** Acceso directo para preparar datos o inspeccionar la base en los tests. */
  raw: DatabaseSync;
}

// node:sqlite devuelve objetos con prototipo nulo; se copian a objetos comunes
// para que toEqual compare bien.
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

export const createNodeSqliteDatabase = (
  raw: DatabaseSync = new DatabaseSync(":memory:"),
): NodeSqliteDatabase => {
  const db: NodeSqliteDatabase = {
    raw,
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, params) {
      return raw.prepare(source).run(...params);
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return raw
        .prepare(source)
        .all(...params)
        .map((row) => plain<T>(row));
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      const row = raw.prepare(source).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
    async withTransactionAsync(task) {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db;
};

export interface FailingOptions {
  /** Rechaza todas las lecturas (getAllAsync / getFirstAsync). */
  failReads?: boolean;
  /** Rechaza todas las escrituras (runAsync / execAsync). */
  failWrites?: boolean;
  /** Rechaza solo la N-ésima llamada a runAsync (1 = la primera). */
  failOnWriteNumber?: number;
}

/**
 * Envuelve una base real y hace fallar lecturas y/o escrituras, para simular
 * errores del almacenamiento. `writeCount()` cuenta las llamadas a runAsync.
 */
export const createFailingDatabase = (
  inner: NodeSqliteDatabase,
  options: FailingOptions,
): NodeSqliteDatabase & { writeCount: () => number } => {
  let writes = 0;
  const fail = (what: string) =>
    Promise.reject(new Error(`Falla simulada de ${what}`));

  return {
    ...inner,
    writeCount: () => writes,
    execAsync(source) {
      return options.failWrites ? fail("escritura") : inner.execAsync(source);
    },
    runAsync(source, params) {
      writes += 1;
      if (options.failWrites || options.failOnWriteNumber === writes) {
        return fail("escritura");
      }
      return inner.runAsync(source, params);
    },
    getAllAsync<T>(source: string, params: SqlValue[]) {
      return options.failReads
        ? fail("lectura")
        : inner.getAllAsync<T>(source, params);
    },
    getFirstAsync<T>(source: string, params: SqlValue[]) {
      return options.failReads
        ? fail("lectura")
        : inner.getFirstAsync<T>(source, params);
    },
    withTransactionAsync(task) {
      return inner.withTransactionAsync(task);
    },
  };
};
