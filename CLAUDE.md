@AGENTS.md

# Thinking Notes (Expo)

App minimalista para capturar ideas en notas y "thinkings", hecha con Expo / React Native
para **Android y web** desde un único código. Respondé y documentá en **español**.

## Reglas del proyecto

- La fuente de verdad es la constitución: [.specify/memory/constitution.md](.specify/memory/constitution.md).
  Ante cualquier duda de stack, calidad o alcance, manda ella.
- Flujo Spec Kit para todo lo no trivial: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Las specs viven en `specs/`.
- Código de una sola plataforma (DOM, `window`, Web Audio, IndexedDB, módulos nativos)
  **solo** en `src/platform/`, con interfaz común e implementaciones `.web.ts` / `.native.ts`.
  Nada de `div`, `span` ni CSS: solo primitivas de React Native y `StyleSheet`.
- Almacenamiento local: `expo-sqlite` en Android y web. Red: solo vía `src/services`.
  Variables de entorno: `process.env.EXPO_PUBLIC_*`.
- Antes de dar algo por terminado: `npx tsc --noEmit`, `npx expo lint`, `npm test` y
  `npx expo export --platform web`.
- Commits: Conventional Commits en español (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`).

## Migración en curso

Este repo reemplaza a la app Vite que vive en `~/codigo/Proyectos/thinking-notes`.

- Esa app es la **referencia de comportamiento**: leé su código antes de migrar algo y
  usá los `spec.md` de `specs/001` a `specs/005` como criterios de aceptación.
- Primero se iguala, después se mejora: nada de funcionalidades nuevas ni rediseños
  durante la migración. Si detectás una mejora, anotala para una spec posterior.
- `specs/001`–`005` son historial: sus `spec.md` siguen vigentes; sus `plan.md` y
  `tasks.md` describen la implementación web vieja y no se vuelven a ejecutar.
- Los imports usan el alias `@/` → `src/`, igual que en la app Vite.

## Decisiones de producto

- Los thinkings dentro de una nota **no se reordenan** (decisión definitiva del usuario,
  2026-11-06). Solo se reordenan las notas del panel lateral (spec 002). No proponerlo
  en specs, planes, tareas ni como mejora futura.
