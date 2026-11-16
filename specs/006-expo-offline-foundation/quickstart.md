# Quickstart: validar la etapa 1 (fundamentos y modo sin cuenta)

**Spec**: [spec.md](./spec.md) · Contratos: [repositorio](./contracts/notes-repository.md),
[contexto](./contracts/notes-context.md), [cabeceras web](./contracts/web-headers.md)

## Requisitos

- Node ≥ 22.5 (los tests usan `node:sqlite`) y npm.
- Android: emulador o dispositivo con Expo Go. `expo-sqlite` y `expo-crypto` vienen
  incluidos en Expo Go, así que esta etapa no necesita un development build.
- Web: Chrome, Firefox o Safari recientes.

```bash
npm install
```

## 1. Gates automáticos

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

Resultado esperado: los cuatro terminan sin errores, y `npm test` incluye las suites de
`types/thinking`, las cinco utilidades, `useDebounce`, `sqliteNotesRepository` (con los
casos de falla) y `notesContext`.

## 2. Cabeceras web

```bash
npx expo start --web
```

```bash
curl -sI http://localhost:8081 | grep -i cross-origin
```

Resultado esperado: aparecen `cross-origin-opener-policy: same-origin` y
`cross-origin-embedder-policy: require-corp`. En la consola del navegador,
`crossOriginIsolated` devuelve `true`.

En el despliegue de Vercel, el mismo `curl -sI https://<proyecto>.vercel.app` devuelve las
dos cabeceras.

## 3. Verificación manual (Android y web)

En la pantalla temporal de verificación, seguí los pasos de la sección
**"Verificación manual (Android y web)"** de la [spec](./spec.md):

1. Crear notas, editar el título y agregar, editar y borrar thinkings.
2. Ver el estado "pendiente" → "guardado".
3. Mover notas.
4. Cerrar la app por completo (Android) o recargar (web) y comprobar que todo se mantiene.
5. Cambiar de nota antes de que pasen 2 s desde la última edición y comprobar, después de
   reabrir, que la edición se guardó (FR-010).

## 4. Despliegue web (una sola vez, manual)

Hay que crear el proyecto nuevo de Vercel, conectado al repo
`LautaroJSON/thinking-notes-expo`, con despliegue automático desde `master`. Vercel toma la
configuración de `vercel.json`, así que no hace falta cargar nada a mano en el panel. Es un
paso del usuario y queda fuera del código.
