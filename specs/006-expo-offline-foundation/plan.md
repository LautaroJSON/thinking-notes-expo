# Implementation Plan: Migración etapa 1 — fundamentos y modo sin cuenta

**Branch**: `006-expo-offline-foundation` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-expo-offline-foundation/spec.md`

## Summary

Traer de la app Vite la base de la app: tipos, normalización de thinkings, cinco utilidades
puras, `useDebounce`, el contexto de notas y `useNotes`, todo con sus tests adaptados a Jest.
Además, reemplazar `localStorage` por SQLite (`expo-sqlite`) en Android y web.

Enfoque técnico:

- La persistencia pasa por un `NotesRepository` intercambiable. En esta etapa la única
  implementación es la de SQLite: una fila por nota, thinkings en JSON y una columna de
  posición. Así el modo con sesión (007) solo tiene que aportar otro repositorio.
- El guardado automático (debounce de 2 s) pasa al `NotesProvider`, con guardado inmediato
  al cambiar o cerrar la nota. El estado pendiente se mantiene si el guardado falla.
- La web sirve COOP/COEP (`require-corp`) desde Metro en desarrollo y desde `vercel.json` en
  producción.
- Una pantalla temporal permite la verificación manual.

## Technical Context

**Language/Version**: TypeScript ~6.0 (`strict`), React 19.3, React Native 0.88, Expo SDK 58

**Primary Dependencies**:
- Existentes: `expo-router`.
- Nuevas: `expo-sqlite` ~58.0.17, `expo-crypto` ~58.0.8.
- Dev: `jest-expo` ~58.0.14, `jest` 30, `@types/jest`, `@testing-library/react-native`.

Todas se instalan con `npx expo install`. `uuid` no se trae (ver R6).

**Storage**: SQLite (`thinking-notes.db`) mediante `expo-sqlite` en Android (nativo) y web
(wasm + OPFS, requiere aislamiento entre orígenes)

**Testing**: Jest 30 con preset `jest-expo`, `@testing-library/react-native` para el
contexto y `node:sqlite` en memoria para probar SQL real en el repositorio

**Target Platform**: Android (Expo Go / APK con EAS) y web (export estático SPA en Vercel)

**Project Type**: app móvil + web desde un solo código (Expo, flujo administrado)

**Performance Goals**: con 200 notas, la lista carga en < 1 s en Android de gama media
(SC-005); un cambio se guarda ≤ 3 s después de dejar de escribir (SC-004)

**Constraints**:
- Sin red ni sesión (modo sin cuenta).
- Sin `withExclusiveTransactionAsync`, porque no existe en web.
- Cabeceras COOP/COEP obligatorias en web.
- Sin APIs de una sola plataforma fuera de `src/platform`.

**Scale/Scope**: uso personal, cientos de notas; ~10 módulos traídos, 3 nuevos (repositorio,
base, id), 1 pantalla temporal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio / regla | Cumplimiento | Estado |
|-------------------|--------------|--------|
| **I. Paridad Offline/Online** | Solo modo sin cuenta. **Excepción declarada** en la spec y registrada abajo (Complexity Tracking). El diseño deja el `NotesRepository` intercambiable y el estado `isLogged` listo para la 007. El modo offline no depende de red ni login. Ante una falla no se pierde lo escrito (R3, R7). | ⚠️ Excepción justificada |
| **II. Minimalista y fluida** | Guardado automático; `loadingSaveNote` refleja pendiente/guardado y no miente si el guardado falla; estado de carga (`gettingNotes`) y errores visibles (`loadError`, `saveError`, `reorderError`). No hay UI definitiva en esta etapa. | ✅ |
| **III. Tests para la lógica** | Jest + `jest-expo`. Se traen los tests de la app Vite de lo migrado. Hay tests nuevos de repositorio (SQL real y fallas) y de contexto (caso feliz, errores, debounce, flush). El modo online no aplica (excepción I). Pasos manuales para Android y web en la spec y el quickstart. | ✅ |
| **IV. TypeScript estricto** | `strict` activo, sin `any`. El JSON de SQLite entra como `unknown` y se valida con `parseThinkings`. El mapeo fila ↔ `INotes` es explícito (`rowToNote`). | ✅ |
| **V. Stack estable** | `expo-sqlite` está en el stack base. `expo-crypto` es un módulo del SDK y reemplaza a `uuid` (R6). Las de test son las oficiales de Expo. `node:sqlite` viene con Node, no es una dependencia. Todo con `npx expo install`. | ✅ |
| **VI. Un solo código** | `expo-sqlite` y `expo-crypto` tienen la misma API JS en ambas plataformas, así que van fuera de `src/platform` y sin `Platform.OS`. La pantalla temporal usa solo primitivas de RN y `StyleSheet`. | ✅ |
| **Restricción: SQLite en web** | COOP/COEP en desarrollo y en Vercel ([contrato](./contracts/web-headers.md)). | ✅ |
| **Restricción: PWA** | Todavía no hay manifest ni service worker en el repo Expo, así que no hay nada que romper. La PWA llega con la interfaz (009+). | ✅ (n/a) |
| **Restricción: rutas** | `src/app/` solo tiene `_layout.tsx` (proveedor) e `index.tsx`, que monta la pantalla temporal desde `src/components/dev/`. | ✅ |
| **Restricción: capa de red / secretos** | Sin red ni secretos. La persistencia vive en `src/services/notes`. | ✅ |
| **Migración** | Se iguala el comportamiento de la app Vite. Los tres desvíos de la spec (guardado fallido sigue pendiente, la lectura fallida no sobrescribe, guardado inmediato al cambiar de nota) aplican los principios I y II y no agregan funcionalidad. | ✅ |
| **Thinkings no se reordenan** | No hay ninguna operación que los reordene (FR-014). | ✅ |

**Re-check post-diseño (Fase 1)**: sin cambios. Los contratos y el modelo de datos no
introducen violaciones nuevas. Única excepción vigente: principio I.

## Project Structure

### Documentation (this feature)

```text
specs/006-expo-offline-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── notes-repository.md
│   ├── notes-context.md
│   └── web-headers.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
metro.config.js                     # NUEVO: wasm + COOP/COEP en desarrollo
vercel.json                         # NUEVO: build, SPA, COOP/COEP
jest.setup.ts                       # NUEVO: mock de expo-crypto → node:crypto
eslint.config.js                    # NUEVO (lo genera `npx expo lint`)
package.json                        # deps + "test": "jest" + config de jest

src/
├── app/
│   ├── _layout.tsx                 # envuelve el Stack con <NotesProvider>
│   └── index.tsx                   # monta la pantalla temporal
├── types/
│   ├── index.ts                    # traído (INotes, IsLoggedType, WaitingResponseType)
│   ├── thinking.ts                 # traído; uuidv4 → newId
│   └── thinking.test.ts
├── lib/
│   └── id.ts                       # NUEVO: newId() = expo-crypto randomUUID
├── components/
│   ├── utils/                      # traídas tal cual, con sus *.test.ts
│   │   ├── dates.ts  reorder.ts  noteLaunch.ts  dictation.ts  copyNote.ts
│   │   └── noteAnimation.ts        # solo el tipo NoteAnimationId (lo usa noteLaunch)
│   └── dev/
│       └── VerificationScreen.tsx  # TEMPORAL: se reemplaza en la etapa de interfaz
├── hooks/
│   ├── useNotes.ts                 # traído
│   ├── useDebounce.ts              # traído
│   └── useDebounce.test.ts
├── context/
│   ├── notes-context.ts            # traído y ajustado al contrato
│   ├── notesContext.tsx            # traído; localStorage/Supabase → NotesRepository
│   └── notesContext.test.tsx       # casos offline de la app Vite + fallas + flush
└── services/
    └── notes/
        ├── repository.ts           # interfaz NotesRepository + NotesDatabase
        ├── database.ts             # getDatabase() + migrateDatabase()
        ├── sqliteNotesRepository.ts
        ├── sqliteNotesRepository.test.ts
        └── testing/
            └── nodeSqliteDatabase.ts   # adaptador node:sqlite (solo tests)
```

**Structure Decision**: una sola app Expo. Se conservan las rutas de la app Vite para que las
capas siguientes se traigan sin reescribir imports (R8). La carga de notas que hacía
`src/components/utils/index.ts` (`loadNotesFromStorage`) pasa a
`sqliteNotesRepository.loadNotes`, y sus tests se adaptan ahí. No se trae `index.ts`, porque
solo existía para `localStorage`.

## Orden de implementación sugerido

1. Jest (`jest-expo`, setup, script) + lint configurado: los gates corren desde el inicio.
2. Tipos + `lib/id` + utilidades puras + `useDebounce`, con sus tests (US5).
3. `NotesDatabase`, migraciones y `sqliteNotesRepository`, con tests de SQL real, de
   normalización (US3) y de fallas (US4).
4. `NotesProvider` / `useNotes` sobre el repositorio, con tests (US1, US2, US4).
5. `metro.config.js` + `vercel.json` (COOP/COEP) y verificación con `curl` (US5).
6. Pantalla temporal + `_layout` (US6) y verificación manual en Android y web (US1).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio I: solo modo sin cuenta en esta etapa | La migración es por capas (constitución); sesión, Supabase y sincronización son la spec 007 | Meter los dos modos en una sola spec la vuelve demasiado grande para revisar y verificar. El diseño (`NotesRepository` intercambiable, `isLogged`) evita rehacer esta capa. |
| Desvíos del comportamiento de la app Vite (3, listados en la spec) | Los principios I y II prohíben perder lo escrito y mostrar "guardado" cuando no lo está | Calcar la app Vite reproduciría pérdidas de datos conocidas. |
