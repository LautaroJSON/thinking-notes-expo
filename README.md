# Thinking Notes (Expo)

App minimalista para capturar ideas en notas y "thinkings", hecha con Expo / React Native
para **Android y web** desde un único código. Reemplaza a la app Vite
([thinking-notes](https://github.com/LautaroJSON/thinking-notes)); la migración se hace por
etapas, cada una con su spec en [`specs/`](specs/).

**Estado**: etapa 1 (spec 006). Las notas sin cuenta se guardan en SQLite en Android y en
web. La interfaz es una pantalla temporal de verificación; la definitiva llega en una spec
posterior.

## Requisitos

- Node.js ≥ 22.13 (lo pide React Native Testing Library; los tests también usan
  `node:sqlite`, disponible desde Node 22.5).
- Android: [Expo Go](https://expo.dev/go) en un dispositivo o emulador.

## Correr la app

```bash
npm install
```

```bash
npx expo start
```

Desde ahí se abre en Android (Expo Go) o en web (tecla `w`).

En web, SQLite necesita aislamiento entre orígenes (cabeceras COOP/COEP). En producción las
sirve `vercel.json`. En desarrollo las agregan `metro.config.js` y `app.json`, salvo en la
raíz `/`: Expo CLI la sirve con un middleware propio que no permite agregar cabeceras. No
afecta, porque la app usa solo la API asíncrona de SQLite (ver "Limitaciones conocidas" de
la spec 006).

## Gates de calidad

Los cuatro deben pasar antes de dar algo por terminado:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npm test
```

```bash
npx expo export --platform web
```

## Estructura

- `src/app/`: pantallas y layouts de Expo Router (solo rutas).
- `src/context/`, `src/hooks/`: estado de notas (`NotesProvider`, `useNotes`).
- `src/services/notes/`: almacenamiento local (repositorio SQLite y migraciones).
- `src/types/`, `src/components/utils/`: tipos del dominio y utilidades puras.
- `specs/`: specs de Spec Kit; la constitución está en `.specify/memory/constitution.md`.

## Flujo de trabajo

Spec Kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
`/speckit-specify` crea la rama `NNN-slug` desde `master`, y cada comando hace commit al
empezar y al terminar. Los commits siguen Conventional Commits en español.
