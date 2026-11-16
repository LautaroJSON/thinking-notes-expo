# Research: Migración etapa 1 — fundamentos y modo sin cuenta

**Fecha**: 2026-11-16 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Fuentes: docs versionadas de Expo SDK 58 (`expo-sqlite`, unit testing, publishing websites),
código de la app Vite (`~/codigo/Proyectos/thinking-notes`) y pruebas locales.

## R1. Almacenamiento local: `expo-sqlite` con API asíncrona

- **Decision**: `expo-sqlite` (`~58.0.17`), API asíncrona (`openDatabaseAsync`, `execAsync`,
  `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`). La base se abre una
  sola vez de forma perezosa (`getDatabase()`), con migraciones por `PRAGMA user_version`,
  el patrón que recomienda la doc.
- **Rationale**: es el almacenamiento que fija la constitución y tiene la misma API en Android
  y en web, así que no va en `src/platform`. La API asíncrona es la única que no bloquea el
  hilo de UI en ambas plataformas.
- **Alternatives considered**:
  - `SQLiteProvider` + `useSQLiteContext`: ata la lógica de notas a un proveedor de React y
    complica testear el contexto con un repositorio falso. Se descarta. La apertura perezosa
    alcanza para una sola base.
  - `withExclusiveTransactionAsync`: **no existe en web**. Se usa `withTransactionAsync`.
    Es no exclusiva, pero las escrituras pasan por una cola única del repositorio (R4).

## R2. Web: wasm y cabeceras COOP/COEP

- **Decision**:
  - `metro.config.js` (generado con `npx expo customize metro.config.js`) agrega `wasm` a
    `resolver.assetExts` y, en `server.enhanceMiddleware`, las cabeceras
    `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp`.
  - `vercel.json` sirve las mismas cabeceras en todas las rutas (`"source": "/(.*)"`), con
    el build `expo export -p web`, la salida `dist` y el rewrite de SPA `/:path*` → `/`, que
    es el ejemplo oficial de Expo para Vercel.
- **Rationale**: `expo-sqlite` en web necesita `SharedArrayBuffer`, que solo existe con
  aislamiento entre orígenes. La doc de Expo usa `COEP: credentialless`, pero **Safari no
  soporta `credentialless`**: en Safari (incluido Safari en iPhone, que es "web móvil") la
  página no quedaría aislada y SQLite no funcionaría. `require-corp` funciona en Chrome,
  Firefox y Safari, y es lo que pide la spec (FR-017).
- **Consecuencia para specs futuras**: con `require-corp`, los recursos de otro origen
  (imágenes de Supabase Storage o avatares de Google en la 007/008) tienen que servirse con
  CORS (atributo `crossOrigin`) o con `Cross-Origin-Resource-Policy`. Queda anotado para
  esas specs.
- **Alternatives considered**: `credentialless` (sin soporte en Safari); configurar las
  cabeceras en la opción `headers` del plugin `expo-router` (es de Expo Hosting, no aplica
  ni al servidor de desarrollo ni a Vercel).

## R3. Forma de guardar las notas: una fila por nota, thinkings en JSON

- **Decision**: tabla `notes` con una fila por nota y los thinkings en una columna de texto
  JSON. El orden de la lista va en una columna `position`. Detalle en
  [data-model.md](./data-model.md).
- **Rationale**:
  - La normalización (`parseThinkings`) trabaja sobre el JSON tal cual, igual que con
    `localStorage`. Así se conservan los formatos viejos y los tipos desconocidos sin un
    esquema por tipo de thinking.
  - Las operaciones son por fila: crear, guardar y borrar tocan solo su nota. Eso resuelve
    FR-007, porque una falla de lectura nunca termina en "escribir la lista entera vacía",
    que es el riesgo que tenía la app Vite.
  - Los thinkings no se reordenan (FR-014), así que no hace falta una tabla aparte con su
    propio orden.
- **Alternatives considered**:
  - Una fila con todo el array (calco de `localStorage`): repite el riesgo de sobrescritura.
  - Tabla `thinkings` normalizada: más SQL y un mapeo por tipo, sin ningún beneficio en esta
    etapa.

## R4. Capa de repositorio intercambiable por modo (preparación para la 007)

- **Decision**: interfaz `NotesRepository` en `src/services/notes/`. En esta etapa hay una
  sola implementación, `createSqliteNotesRepository(db)`. El `NotesProvider` recibe el
  repositorio por prop (por defecto el de SQLite), así que el modo con sesión solo tiene que
  aportar otra implementación. Contrato en
  [contracts/notes-repository.md](./contracts/notes-repository.md).
- **Rationale**: cumple la excepción declarada al principio I (FR-016) sin implementar nada
  remoto. Además permite testear el contexto con un repositorio falso y el repositorio con
  una base SQLite real.
- **Escrituras serializadas**: el repositorio encadena sus escrituras en una cola (una
  promesa por vez). Así un guardado y un reordenamiento seguidos no se mezclan dentro de
  `withTransactionAsync`, que en web no es exclusiva.

## R5. Tests: Jest 30 + `jest-expo`, y SQL real con `node:sqlite`

- **Decision**:
  - Paquetes: `npx expo install jest-expo jest @types/jest @testing-library/react-native -- --dev`.
    En SDK 58, `jest-expo` requiere Jest 30.
  - `package.json`: `"jest": { "preset": "jest-expo", "setupFiles": ["<rootDir>/jest.setup.ts"] }`
    y `"test": "jest"`. Se usa `jest` sin `--watchAll` porque es un gate y corre en CI.
  - Los tests van junto al código (`*.test.ts(x)`), igual que en la app Vite.
  - Los tests del repositorio corren contra **SQLite real en memoria** a través de
    `node:sqlite`, que viene incluido en Node 22.5+ (probado en Node 24.13). Un adaptador
    chico de test implementa la parte de la interfaz de base que usa el repositorio.
  - Las fallas de lectura y escritura se simulan con un adaptador que rechaza las promesas.
- **Rationale**: probar el SQL de verdad (migraciones, `ON CONFLICT`, orden) sin agregar
  dependencias nativas. `expo-sqlite` no corre en Node.
- **Alternatives considered**:
  - `better-sqlite3`: dependencia nativa extra; `node:sqlite` ya hace lo mismo.
  - Mockear `expo-sqlite` con funciones vacías: no prueba el SQL.
- **Nota**: `node:sqlite` emite un `ExperimentalWarning` en Node 24. Es inofensivo. CI debe
  usar Node ≥ 22.5.

## R6. Identificadores: `expo-crypto` en lugar de `uuid`

- **Decision**: `randomUUID()` de `expo-crypto` (`~58.0.8`), detrás de `src/lib/id.ts`
  (`newId()`). En Jest se mockea con `node:crypto.randomUUID` en `jest.setup.ts`.
- **Rationale**: `uuid` v13 depende de `crypto.getRandomValues`, que Hermes (Android) no trae
  sin un polyfill. `expo-crypto` es un módulo del SDK (se prefiere por el principio V) y
  funciona en Android y web. El formato (UUID v4) es el mismo, así que `parseThinkings`
  mantiene su comportamiento y sus tests (regex de UUID v4).
- **Alternatives considered**: `uuid` + `react-native-get-random-values` (dos dependencias en
  lugar de una del SDK).

## R7. Guardado automático y estado pendiente/guardado

- **Decision**:
  - El debounce de 2 s (`useDebounce`, traído tal cual con su test) pasa del componente
    editor al `NotesProvider`. El proveedor guarda cuando la nota activa con debounce cambia
    y hay cambios pendientes.
  - `closeActiveNote`, `setActiveNote` y `removeThinking` guardan de inmediato la nota
    pendiente (FR-010), pasando la nota como argumento para no depender del estado que se
    está reemplazando.
  - El estado pendiente se sigue llamando `loadingSaveNote`, como en la app Vite. Si la
    escritura falla, queda en `true` y se expone `saveError`.
- **Rationale**: en la app Vite el debounce vivía en `ActiveNoteView`. Ahora no hay editor
  definitivo, y dejarlo en el proveedor permite testearlo y que la pantalla temporal sea
  trivial. La interfaz definitiva (009+) solo llama a `updateActiveNote`.
- **Alternatives considered**: hook `useAutoSave` en la pantalla. Se descarta porque
  duplicaría la lógica en cada pantalla y no permitiría el guardado inmediato al cambiar de
  nota.

## R8. Ubicación de archivos y alias

- **Decision**: se conservan las rutas de la app Vite (`src/types`, `src/components/utils`,
  `src/context`, `src/hooks`) y el alias `@/`, que ya está en `tsconfig.json` y Expo lo
  resuelve en Metro y en `jest-expo`. Lo nuevo va en `src/services/notes/` y `src/lib/`.
- **Rationale**: los imports de las capas siguientes se traen sin reescribir rutas, como pide
  CLAUDE.md.

## R9. Lint

- **Decision**: el proyecto todavía no tiene `eslint.config.js`. La primera vez que se corre,
  `npx expo lint` instala y configura `eslint-config-expo`, y eso se commitea. El proyecto
  arranca sin deuda (0 errores, 0 warnings).
