---

description: "Tareas de implementación de la spec 006 — fundamentos y modo sin cuenta"
---

# Tasks: Migración etapa 1 — fundamentos y modo sin cuenta

**Input**: Documentos de diseño de `specs/006-expo-offline-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: SÍ. Los piden la spec (FR-019) y la constitución (principio III: la lógica traída
de la app Vite trae sus tests, adaptados a Jest). Escribir cada test antes que su
implementación y verificar que falla.

**Organization**: tareas agrupadas por historia de usuario (US1–US6 de la spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: historia de usuario de la spec (US1…US6)
- **App Vite** = `~/codigo/Proyectos/thinking-notes` (referencia de comportamiento; leer el
  archivo original antes de traerlo)

## Reglas para todas las tareas

- Sin `any`. Imports con alias `@/` → `src/`. Solo primitivas de React Native y `StyleSheet`.
- Al adaptar tests de Vitest: `vi.fn` → `jest.fn`, `vi.spyOn` → `jest.spyOn`,
  `vi.useFakeTimers` → `jest.useFakeTimers`, `vi.mocked(x)` → `jest.mocked(x)`, y sacar el
  import de `vitest` (Jest expone los globales).
- Instalar dependencias **solo** con `npx expo install`.
- Textos visibles y comentarios en español.

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: dejar corriendo los cuatro gates sobre el proyecto vacío.

- [X] T001 Instalar las dependencias de runtime con `npx expo install expo-sqlite expo-crypto` y verificar que quedan en `dependencies` de package.json con versiones `~58.x`
- [X] T002 Instalar las dependencias de test con `npx expo install jest-expo jest @types/jest @testing-library/react-native -- --dev` (en SDK 58, `jest-expo` requiere Jest 30) en package.json
- [X] T003 Configurar Jest en package.json: script `"test": "jest"` y bloque `"jest": { "preset": "jest-expo", "setupFiles": ["<rootDir>/jest.setup.ts"] }`
- [X] T004 Crear jest.setup.ts con `jest.mock("expo-crypto", () => ({ randomUUID: () => require("node:crypto").randomUUID() }))` (research R6) y `jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn(() => Promise.reject(new Error("expo-sqlite no está disponible en Jest"))) }))`, así importar el proveedor o el repositorio por defecto no carga el módulo nativo; los tests usan siempre el adaptador de node:sqlite o un repositorio falso
- [X] T005 Agregar los tipos de Jest a TypeScript (`"types": ["jest"]` en compilerOptions de tsconfig.json, o `/// <reference types="jest" />` en jest.setup.ts si `types` rompe los tipos de Expo) y confirmar con `npx tsc --noEmit`
- [X] T006 [P] Correr `npx expo lint` por primera vez para generar eslint.config.js con `eslint-config-expo` y dejarlo en 0 errores y 0 warnings sobre el código actual
- [X] T007 Crear un test de humo temporal src/lib/smoke.test.ts (`expect(1).toBe(1)`) y confirmar que `npm test` corre en verde; borrarlo en cuanto exista el primer test real (T010)

**Checkpoint**: `npx tsc --noEmit`, `npx expo lint` y `npm test` pasan.

---

## Phase 2: Foundational (prerrequisitos de todas las historias)

**Purpose**: tipos del dominio, ids, utilidades que usa el contexto, la interfaz de base y
el adaptador de test de SQLite.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

- [X] T008 [P] Crear src/lib/id.ts con `export const newId = (): string => randomUUID()` (de `expo-crypto`)
- [X] T009 [P] Traer src/types/index.ts de la app Vite (`src/types/index.ts`) tal cual: `INotes`, `IsLoggedType`, `WaitingResponseType` y los re-exports de `./thinking`
- [X] T010 Traer src/types/thinking.test.ts de la app Vite (`src/types/thinking.test.ts`) adaptado a Jest (mismo regex de UUID v4, `jest.spyOn(console, "warn")`) y verificar que falla; borrar src/lib/smoke.test.ts
- [X] T011 Traer src/types/thinking.ts de la app Vite cambiando solo `uuidv4()` por `newId()` de `@/lib/id` (sin importar `uuid`) hasta que T010 pase
- [X] T012 [P] Traer src/hooks/useDebounce.test.ts de la app Vite adaptado a Jest con timers falsos (`jest.useFakeTimers`, `renderHook` y `act` de `@testing-library/react-native`)
- [X] T013 [P] Traer src/hooks/useDebounce.ts de la app Vite tal cual hasta que T012 pase
- [X] T014 [P] Traer src/components/utils/reorder.test.ts de la app Vite adaptado a Jest
- [X] T015 [P] Traer src/components/utils/reorder.ts de la app Vite tal cual (`moveNote`, `applyOrder`) hasta que T014 pase
- [X] T016 Crear src/services/notes/repository.ts con el tipo `NotesDatabase` (la parte de `SQLiteDatabase` de `expo-sqlite` que se usa: `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`, expresada con `Pick<SQLiteDatabase, ...>`) y la interfaz `NotesRepository` exacta de contracts/notes-repository.md
- [X] T017 Crear el adaptador de test src/services/notes/testing/nodeSqliteDatabase.ts: `createNodeSqliteDatabase(): NotesDatabase` sobre `DatabaseSync(":memory:")` de `node:sqlite`. Cada método async envuelve `prepare(sql).run/all/get(...params)`; `execAsync` usa `exec`; `withTransactionAsync(task)` hace `BEGIN`, `await task()` y `COMMIT`, o `ROLLBACK` y relanza si falla. Agregar también `createFailingDatabase(options: { failReads?: boolean; failWrites?: boolean; failOnWriteNumber?: number })`, que envuelve una base de node:sqlite real y rechaza todas las lecturas, todas las escrituras, o solo la N-ésima llamada a `runAsync` (para simular una falla a mitad de una transacción, T040); lo usan US2 y US4
- [X] T018 Crear src/services/notes/database.test.ts: `migrateDatabase` sobre la base de node:sqlite crea la tabla `notes` con las columnas de data-model.md, deja `PRAGMA user_version = 1` y es idempotente si se llama dos veces
- [X] T019 Crear src/services/notes/database.ts con `migrateDatabase(db: NotesDatabase)` (migración 0 → 1 de data-model.md, dentro de `withTransactionAsync`, con `PRAGMA user_version`) y `getDatabase()`: `openDatabaseAsync("thinking-notes.db")` + `migrateDatabase`, con la promesa memoizada y limpiada si falla; hasta que T018 pase

**Checkpoint**: tipos, ids, debounce, reordenamiento y base migrada, todo con tests en verde.

---

## Phase 3: User Story 1 — Mis notas sin cuenta sobreviven al cerrar la app (Priority: P1) 🎯 MVP

**Goal**: crear, seleccionar, editar (título y thinkings de texto), borrar notas y
thinkings con guardado automático persistente en SQLite.

**Independent Test**: tests del repositorio (persistencia real en node:sqlite: lo que se
guarda con una instancia lo lee otra sobre la misma base) y del contexto (crear, editar,
debounce de 2 s, guardado inmediato, borrar); a mano, pasos 1–3, 5 y 6 de la verificación
manual de la spec (necesita US6 para la pantalla).

### Tests for User Story 1 ⚠️

- [X] T020 [P] [US1] Crear src/services/notes/sqliteNotesRepository.test.ts con los casos felices sobre node:sqlite: `loadNotes` vacía en una base nueva; `createNote` agrega al final (posición siguiente); `saveNote` actualiza título, thinkings y `updatedAt` sin tocar `position` ni `createdAt`; `saveNote` de una nota inexistente la inserta al final; `deleteNote` la borra y no falla con ids inexistentes; `loadNotes` devuelve el orden por `position` y los thinkings de imagen o de tipo desconocido intactos; una segunda instancia del repositorio sobre la misma base lee lo mismo
- [X] T021 [P] [US1] Crear src/context/notesContext.test.tsx con un repositorio falso en memoria (`jest.fn` por método) inyectado en `<NotesProvider repository={...}>` y `renderHook(useNotes, { wrapper })`, adaptando de la app Vite (`src/context/notesContext.test.tsx`) solo los casos offline que aplican. Cubrir: `isLogged` pasa de `"loading"` a `"offline"` y carga con `waitingResponse` `"gettingNotes"` → `"none"`; `addNote` crea "Nueva Nota :)" con id, `createdAt` = `updatedAt`, la agrega al final, la activa y llama a `createNote`; `loadingSaveNote` es `true` mientras `createNote` o `deleteNote` están en curso (promesas controladas a mano) y vuelve a `false` al resolverse; `updateActiveNote` deja `loadingSaveNote = true` y, con timers falsos, guarda **una sola vez** a los 2 s con la última versión (sin loop); varias ediciones seguidas guardan solo la última; después de guardar, `updatedAt` cambia y `createdAt` no; `setActiveNote` o `closeActiveNote` con cambios pendientes llaman a `saveNote` de inmediato con la nota que se deja; `removeThinking` quita el thinking y guarda de inmediato sin cambiar el orden de los demás; `deleteNote` la saca de la lista, cierra la activa y llama a `deleteNote`; la identidad de `saveUpdatesNotesOnDBorLocalStorage` es estable; `useNotes` fuera del proveedor lanza "useNotes debe usarse dentro de un NotesProvider"

### Implementation for User Story 1

- [X] T022 [US1] Implementar src/services/notes/sqliteNotesRepository.ts: `createSqliteNotesRepository(db: NotesDatabase): NotesRepository` con `loadNotes` (`SELECT … ORDER BY position, rowid`, mapeo `rowToNote` de data-model.md, por ahora sin reescritura de migrados), `createNote` (`INSERT` con `COALESCE(MAX(position), -1) + 1`), `saveNote` (upsert `ON CONFLICT(id) DO UPDATE SET title, thinkings, updated_at`), `deleteNote`, y la cola interna de escrituras de a una (research R4), hasta que T020 pase
- [X] T023 [US1] Agregar `createDefaultNotesRepository()` en src/services/notes/sqliteNotesRepository.ts: devuelve un `NotesRepository` cuyos métodos esperan `getDatabase()` y delegan en `createSqliteNotesRepository(db)`, creado una sola vez
- [X] T024 [US1] Reescribir src/context/notes-context.ts con el `NotesContextType` exacto de contracts/notes-context.md (sin `addImageThinking` ni `editImageThinking`; con `saveError` y `loadError`) y `NotesContext = createContext<NotesContextType | undefined>(undefined)`
- [X] T025 [P] [US1] Traer src/hooks/useNotes.ts de la app Vite tal cual
- [X] T026 [US1] Implementar src/context/notesContext.tsx a partir del `NotesProvider` de la app Vite, quitando Supabase, imágenes, sonidos, borradores y la demora simulada. Props: `repository` (por defecto `createDefaultNotesRepository()`) y `autosaveDelayMs` (por defecto `AUTOSAVE_DELAY_MS = 2000`). Debe: resolver `isLogged` a `"offline"` al montar; cargar con `repository.loadNotes()`; implementar `addNote`, `setActiveNote`, `getActiveNote`, `updateActiveNote` (marca pendiente), `closeActiveNote`, `deleteNote` y `removeThinking`; manejar el autosave con `useDebounce(activeNoteState, autosaveDelayMs)` cuando hay pendiente; al cambiar o cerrar la nota, copiar primero el snapshot de la que se deja a `notes` en memoria y después guardarlo; usar `latestStateRef` para que `saveUpdatesNotesOnDBorLocalStorage` tenga identidad estable; calcular `loadingSaveNote` como indica la sección "Pendiente" de contracts/notes-context.md (ediciones posteriores al snapshot, `unsavedIds` o escrituras en curso con un contador). Seguir hasta que T021 pase
- [X] T027 [US1] Envolver el `<Stack />` de src/app/_layout.tsx con `<NotesProvider>`

**Checkpoint**: US1 completa a nivel lógica; persistencia probada en tests.

---

## Phase 4: User Story 5 — Base del proyecto lista para seguir migrando (Priority: P1)

**Goal**: el resto de las utilidades puras con sus tests y la web con COOP/COEP en
desarrollo y Vercel.

**Independent Test**: `npm test` incluye las suites de las cinco utilidades;
`curl -sI http://localhost:8081 | grep -i cross-origin` muestra las dos cabeceras
(quickstart §2).

### Tests for User Story 5 ⚠️

- [X] T028 [P] [US5] Traer src/components/utils/dates.test.ts de la app Vite adaptado a Jest
- [X] T029 [P] [US5] Traer src/components/utils/noteLaunch.test.ts de la app Vite adaptado a Jest
- [X] T030 [P] [US5] Traer src/components/utils/dictation.test.ts de la app Vite adaptado a Jest
- [X] T031 [P] [US5] Traer src/components/utils/copyNote.test.ts de la app Vite adaptado a Jest

### Implementation for User Story 5

- [X] T032 [P] [US5] Traer src/components/utils/dates.ts de la app Vite tal cual hasta que T028 pase (si `Intl.DateTimeFormat("es")` da otro formato en Hermes, es un tema de la interfaz y se anota; el test corre en Node)
- [X] T033 [P] [US5] Crear src/components/utils/noteAnimation.ts solo con `NOTE_ANIMATION_IDS` y `type NoteAnimationId` (sin la carga ni el guardado en `localStorage` de la app Vite)
- [X] T034 [US5] Traer src/components/utils/noteLaunch.ts de la app Vite tal cual hasta que T029 pase (depende de T033)
- [X] T035 [P] [US5] Traer src/components/utils/dictation.ts de la app Vite tal cual hasta que T030 pase
- [X] T036 [P] [US5] Traer src/components/utils/copyNote.ts de la app Vite tal cual hasta que T031 pase
- [X] T037 [P] [US5] Generar metro.config.js con `npx expo customize metro.config.js`, agregar `config.resolver.assetExts.push("wasm")` y, en `config.server.enhanceMiddleware`, las cabeceras `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp` (contracts/web-headers.md)
- [X] T038 [P] [US5] Crear vercel.json con `buildCommand: "npx expo export -p web"`, `outputDirectory: "dist"`, `framework: null`, `cleanUrls: true`, el rewrite `{ source: "/:path*", destination: "/" }` y `headers: [{ source: "/(.*)", headers: [COOP same-origin, COEP require-corp] }]`
- [X] T039 [US5] Verificar con `npx expo start --web` y `curl -sI http://localhost:8081 | grep -i cross-origin` que se ven las dos cabeceras, y que `npx expo export --platform web` incluye el `.wasm` de expo-sqlite en `dist/`
  - Resuelto (2026-11-16): las cabeceras se ven en todas las rutas salvo en la raíz `/` de desarrollo (ver "Limitaciones conocidas" en la spec). Se mantienen; la raíz sin cabeceras se acepta porque la app usa solo la API asíncrona.

**Checkpoint**: base completa; los cuatro gates pasan.

---

## Phase 5: User Story 2 — Reordenar las notas de la lista (Priority: P2)

**Goal**: mover una nota a la posición de otra, persistir el orden y revertir si falla.

**Independent Test**: tests de `saveOrder` (SQL real) y de `reorderNotes` (contexto);
a mano, paso 4 de la verificación de la spec.

### Tests for User Story 2 ⚠️

- [X] T040 [P] [US2] Agregar a src/services/notes/sqliteNotesRepository.test.ts: `saveOrder(["c","a","b"])` hace que `loadNotes` devuelva C, A, B; ignora ids desconocidos; no cambia `updated_at`; con una falla a mitad de la transacción, el orden guardado queda como estaba
- [X] T041 [P] [US2] Agregar a src/context/notesContext.test.tsx (casos de `reorderNotes` offline de la app Vite): reordena y llama a `saveOrder` con los ids nuevos; soltar en la misma posición o con un id inexistente no llama a nada; mantiene abierta la nota activa; no cambia `updatedAt`; si `saveOrder` rechaza vuelve al orden anterior conservando una edición de contenido hecha mientras tanto y expone `reorderError = "No se pudo guardar el orden de las notas."`; `clearReorderError` lo limpia y tiene identidad estable

### Implementation for User Story 2

- [X] T042 [US2] Implementar `saveOrder(ids)` en src/services/notes/sqliteNotesRepository.ts (`UPDATE notes SET position = ? WHERE id = ?` por índice, en una sola `withTransactionAsync`, dentro de la cola de escrituras) hasta que T040 pase
- [X] T043 [US2] Implementar `reorderNotes` y `clearReorderError` en src/context/notesContext.tsx igual que en la app Vite (`moveNote`, no-op por referencia, `applyOrder` para revertir) usando `repository.saveOrder`, hasta que T041 pase

**Checkpoint**: US1 + US2 funcionan; el orden sobrevive a reabrir.

---

## Phase 6: User Story 3 — Datos con formato viejo se normalizan al cargar (Priority: P2)

**Goal**: la carga aplica la misma normalización que `loadNotesFromStorage` de la app Vite y
reescribe una sola vez.

**Independent Test**: tests de `loadNotes` con filas en formato viejo insertadas a mano en
node:sqlite.

### Tests for User Story 3 ⚠️

- [X] T044 [US3] Adaptar a src/services/notes/sqliteNotesRepository.test.ts los casos de src/components/utils/index.test.ts de la app Vite, insertando filas a mano con SQL: thinkings `["uno","dos"]` → dos `TextThinking` con UUIDs nuevos en orden, y la columna `thinkings` reescrita con el formato nuevo; una segunda carga devuelve los mismos ids y no reescribe (espiar `runAsync`); thinkings válidos no se reescriben; inválidos se descartan con `console.warn`; tipo desconocido intacto; ids repetidos → id nuevo; `title` no textual → `""`; `created_at`/`updated_at` `NULL` → campos ausentes; JSON inválido en `thinkings` → nota con `thinkings: []`, `console.error` y la fila **sin** reescribir

### Implementation for User Story 3

- [X] T045 [US3] Completar `loadNotes` en src/services/notes/sqliteNotesRepository.ts: `JSON.parse` protegido por fila (`unknown`), `parseThinkings`, y reescritura en una transacción solo de la columna `thinkings` de las notas con `migrated = true` (nunca las de JSON inválido), hasta que T044 pase

**Checkpoint**: la normalización da el mismo resultado que la app Vite (SC-002).

---

## Phase 7: User Story 4 — Lo escrito no se pierde si falla el almacenamiento (Priority: P2)

**Goal**: ante fallas de lectura o escritura, el contenido queda en memoria, no se marca como
guardado, nada guardado se sobrescribe y el error es visible.

**Independent Test**: tests con `createFailingDatabase` (repositorio) y con un repositorio
falso que rechaza (contexto).

### Tests for User Story 4 ⚠️

- [X] T046 [P] [US4] Agregar a src/services/notes/sqliteNotesRepository.test.ts con `createFailingDatabase`: `loadNotes` rechaza si falla la lectura y no hace ninguna escritura; `saveNote`, `createNote` y `deleteNote` rechazan con el error original sin dejar la fila a medias; una escritura que falla no bloquea la siguiente en la cola
- [X] T047 [P] [US4] Agregar a src/context/notesContext.test.tsx: si `loadNotes` rechaza, queda `notes = []`, `waitingResponse = "none"`, `loadError = "No se pudieron cargar las notas."` y no se llama a ningún método de escritura; si `saveNote` rechaza, el contenido sigue en `activeNoteState`, `loadingSaveNote` sigue `true`, `saveError = "No se pudieron guardar los cambios."`, y el siguiente guardado exitoso pone `saveError = null` y `loadingSaveNote = false`; si `saveNote` rechaza al cambiar de nota (`setActiveNote(otra)`), la nota dejada conserva sus cambios en `notes`, al volver a abrirla se ven, `loadingSaveNote` sigue `true` y el siguiente guardado (por ejemplo, un autosave de la otra nota) llama a `saveNote` también con ella; si `createNote` rechaza, la nota sigue en la lista, `saveError` tiene el mensaje y el siguiente guardado llama a `saveNote` con esa nota (upsert); si `deleteNote` rechaza, la nota vuelve a `notes` en su posición original y `saveError = "No se pudo borrar la nota."`; una edición hecha mientras un guardado está en vuelo deja `loadingSaveNote = true` al terminar ese guardado

### Implementation for User Story 4

- [X] T048 [US4] Completar el manejo de errores en src/services/notes/sqliteNotesRepository.ts (cola que sigue después de un rechazo, sin escrituras en el camino de lectura) hasta que T046 pase
- [X] T049 [US4] Completar el manejo de errores en src/context/notesContext.tsx según contracts/notes-context.md: `loadError`; `saveError`; ref `unsavedIds` (entra al fallar crear o guardar, sale al guardar bien o al borrar); reintento de `unsavedIds` después de cada guardado; restaurar la nota en su posición si falla `deleteNote` (`applyOrder` con el orden previo); comparación con el snapshot; `console.error` además del mensaje visible. Seguir hasta que T047 pase

**Checkpoint**: SC-003 cubierto por tests.

---

## Phase 8: User Story 6 — Pantalla temporal de verificación (Priority: P3)

**Goal**: probar a mano en Android y web todo lo anterior.

**Independent Test**: los pasos de la verificación manual de la spec en Android (Expo Go) y
en web.

### Implementation for User Story 6

- [X] T050 [US6] Crear src/components/dev/VerificationScreen.tsx (solo `View`, `Text`, `TextInput`, `Pressable`, `ScrollView` y `StyleSheet`; comentario inicial: "TEMPORAL — se reemplaza en la etapa de interfaz (spec 009+)"). Debe tener: indicador de carga (`waitingResponse`) y de estado ("Pendiente…" o "Guardado", más `saveError`, `loadError` y `reorderError` con botón para descartar); lista de notas con título y fecha (`formatNoteDate`), cada una con "Abrir", "↑" y "↓" (`reorderNotes` con la nota vecina) y "Borrar"; botón "Nueva nota" (`addNote`); y, para la nota activa, `TextInput` de título (`updateActiveNote({ title })`), lista de thinkings (texto editable con `updateActiveNote` reemplazando por id; los de imagen o desconocidos se muestran como "[Imagen]" o el tipo, sin edición) con "Borrar" (`removeThinking`), un `TextInput` + "Agregar" (`createTextThinking`) y "Cerrar nota" (`closeActiveNote`). Sin controles para reordenar thinkings. Solo si `__DEV__`: botón "Crear 200 notas de prueba" que crea 200 notas con 10 thinkings de texto cada una a través de `addNote` + `updateActiveNote` (o directamente con el repositorio por defecto y recargando la lista), para medir SC-005
- [X] T051 [US6] Reemplazar el contenido de src/app/index.tsx para que renderice `<VerificationScreen />`
- [X] T052 [US6] Verificación manual en web (`npx expo start --web`): pasos 1–7 de la sección "Verificación manual" de la spec, más el paso 5 del quickstart §3 (cambiar de nota antes de 2 s y recargar); anotar el resultado en el PR
  - Resultado (2026-11-16): pasos 1–7 y quickstart §3 paso 5 correctos; 200 notas cargadas en 355 ms.
- [X] T053 [US6] Verificación manual en Android con Expo Go: pasos 1–6 y 8 de la spec (cerrar la app por completo desde recientes; con 200 notas de prueba, medir que la lista aparezca en menos de 1 s, SC-005) más el quickstart §3 paso 5; anotar resultados y tiempo medido en el PR
  - Resultado (2026-11-16): pasos 1–6 y 8 y quickstart §3 paso 5 correctos; 200 notas cargadas en 730–771 ms (SC-005 < 1 s). Un error de Expo Go en la primera apertura, que no se repitió (ver "Limitaciones conocidas" en la spec).

**Checkpoint**: las seis historias funcionan y están verificadas en ambas plataformas.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T054 [P] Revisar que no quede `any`, `localStorage`, `window`, `document`, `uuid`, `Platform.OS` ni imports de `vitest` en src/ (`grep -rnE ":\s*any\b|as any|<any>|localStorage|window\.|document\.|from \"uuid\"|Platform\.OS|vitest" src/`) y corregir lo que aparezca
- [X] T055 [P] Medir la carga de 200 notas: agregar a src/services/notes/sqliteNotesRepository.test.ts un caso que crea 200 notas con 10 thinkings y verifica que `loadNotes` las devuelve en orden (sirve de referencia para SC-005; la medición en un dispositivo real va en T053)
- [X] T056 Actualizar README.md con cómo correr la app (Android con Expo Go, web), los cuatro gates y el requisito de Node ≥ 22.5 para los tests
- [X] T057 Correr los cuatro gates del quickstart §1 (`npx tsc --noEmit`, `npx expo lint`, `npm test`, `npx expo export --platform web`) y dejarlos en verde
- [ ] T058 Crear el proyecto nuevo de Vercel conectado a `LautaroJSON/thinking-notes-expo` (despliegue desde `master`) y verificar las cabeceras con `curl -sI https://<proyecto>.vercel.app | grep -i cross-origin`. **Lo hace el usuario** (quickstart §4); se puede hacer después del merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: arranca ya.
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias.
- **US1 (Phase 3)**: depende de Foundational.
- **US5 (Phase 4)**: depende de Foundational; es independiente de US1 (utilidades y
  cabeceras no tocan el contexto). Se puede hacer en paralelo con US1.
- **US2, US3, US4 (Phases 5–7)**: dependen de US1, porque extienden el repositorio y el
  contexto de T022 y T026. Entre sí tocan los mismos archivos, así que van en secuencia:
  US2 → US3 → US4.
- **US6 (Phase 8)**: depende de US1 y, para verificar todo, de US2–US5.
- **Polish (Phase 9)**: al final. T058 puede quedar para después del merge.

### Within Each User Story

- Tests primero (deben fallar), después la implementación hasta ponerlos en verde.
- Repositorio antes que contexto.

### Parallel Opportunities

- Setup: T006 en paralelo con T003–T005.
- Foundational: T008, T009, T012/T013 y T014/T015 en paralelo; T016 → T017 → T018 → T019
  en secuencia.
- US1: T020 ‖ T021 (tests); T025 ‖ T022.
- US5: T028–T031 en paralelo; T032, T033, T035, T036, T037 y T038 en paralelo; T034 después
  de T033.
- US1 ‖ US5 completas, en paralelo.
- US2: T040 ‖ T041. US4: T046 ‖ T047.
- Polish: T054 ‖ T055.

---

## Parallel Example: User Story 5

```bash
# Tests de utilidades, todos a la vez:
Task: "T028 Traer dates.test.ts adaptado a Jest"
Task: "T029 Traer noteLaunch.test.ts adaptado a Jest"
Task: "T030 Traer dictation.test.ts adaptado a Jest"
Task: "T031 Traer copyNote.test.ts adaptado a Jest"

# Implementaciones y configuración web, todos a la vez:
Task: "T032 Traer dates.ts"
Task: "T033 Crear noteAnimation.ts (solo tipos)"
Task: "T037 metro.config.js con wasm y COOP/COEP"
Task: "T038 vercel.json con build, SPA y COOP/COEP"
```

## Parallel Example: User Story 1

```bash
Task: "T020 Tests felices de sqliteNotesRepository sobre node:sqlite"
Task: "T021 Tests del NotesProvider con repositorio falso"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 (Setup) + Phase 2 (Foundational).
2. Phase 3 (US1): persistencia y lógica de notas probadas con tests.
3. Para verlo a mano antes de tiempo, adelantar T050–T051 (pantalla) y verificar.

### Incremental Delivery

1. Setup + Foundational → gates en verde.
2. US1 (+ US5 en paralelo) → MVP lógico y base completa.
3. US2 → reordenar. US3 → normalización. US4 → robustez ante fallas.
4. US6 → pantalla y verificación manual en Android y web → PR a `master`.

### Notes

- Cada tarea o grupo lógico se puede commitear por separado (Conventional Commits en español).
- No agregar nada fuera de alcance: imágenes, sonidos, borradores, sesión o interfaz definitiva.
- Los thinkings dentro de una nota **no** se reordenan.
