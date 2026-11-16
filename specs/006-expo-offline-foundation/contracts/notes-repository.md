# Contrato: `NotesRepository`

**Ubicación**: `src/services/notes/repository.ts` (interfaz) y
`src/services/notes/sqliteNotesRepository.ts` (implementación de esta etapa).

Es la única puerta entre la lógica de notas y el almacenamiento. En la spec 007, el modo con
sesión aporta otra implementación con este mismo contrato; el `NotesProvider` no cambia su
lógica, solo el repositorio que usa según `isLogged`.

```ts
export interface NotesRepository {
  /** Notas en el orden de la lista, ya normalizadas (data-model.md). */
  loadNotes(): Promise<INotes[]>;
  /** Persiste una nota nueva al final de la lista. Devuelve la nota guardada. */
  createNote(note: INotes & { id: string }): Promise<INotes>;
  /** Guarda título, thinkings y updatedAt. Si no existía, la crea al final. */
  saveNote(note: INotes & { id: string }): Promise<INotes>;
  deleteNote(id: string): Promise<void>;
  /** Fija el orden de la lista. Los ids desconocidos se ignoran. */
  saveOrder(ids: string[]): Promise<void>;
}
```

## Garantías

| Método | Éxito | Error |
|--------|-------|-------|
| `loadNotes` | Devuelve las notas normalizadas. Si hubo `migrated`, reescribe una sola vez los `thinkings` de esas notas. | Rechaza. **No escribe nada.** |
| `createNote` | Inserta la nota con la posición siguiente a la última. | Rechaza; no hay escrituras parciales. |
| `saveNote` | Upsert del contenido; no toca `position` ni `created_at`. | Rechaza; la fila queda como estaba. |
| `deleteNote` | Borra la fila. Si el id no existe, no hace nada. | Rechaza. |
| `saveOrder` | Actualiza `position` de todos los ids en **una** transacción. | Rechaza; se deshace la transacción y el orden guardado queda como estaba. |

- **Serialización**: las escrituras de una instancia corren de a una, en el orden en que se
  pidieron (cola interna). Una escritura que falla no bloquea las siguientes.
- **Errores**: se rechaza con el error original. Quien llama decide el mensaje para el
  usuario.
- **Dependencia de base**: la implementación recibe un objeto que cumple la parte de
  `SQLiteDatabase` que usa (`execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`,
  `withTransactionAsync`), tipado como `NotesDatabase`. En la app es la base de
  `getDatabase()`. En los tests, un adaptador sobre `node:sqlite` en memoria, o uno que
  rechaza para simular fallas.

## Apertura de la base

`src/services/notes/database.ts`:

- `getDatabase(): Promise<NotesDatabase>`: abre `thinking-notes.db` una sola vez (memoiza la
  promesa) y aplica las migraciones pendientes (`migrateDatabase(db)`). Si la apertura falla,
  limpia la memoización para que el próximo intento vuelva a probar.
- `migrateDatabase(db)`: aplica las migraciones según `PRAGMA user_version`, en transacción.
  Es idempotente.
