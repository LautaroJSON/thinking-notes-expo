<!--
Sync Impact Report
- Versión: 1.1.0 → 2.0.0 (MAJOR: migración de la app web Vite a Expo / React Native)
- Contexto: la constitución se trae del repositorio `thinking-notes` (app Vite) al nuevo
  repositorio `thinking-notes-expo`, que reemplazará a la app Vite cuando alcance paridad.
- Principios modificados:
  - I. Paridad Offline/Online: `localStorage` → SQLite (`expo-sqlite`) en Android y web.
  - II. Experiencia Minimalista y Fluida: "PWA instalable" → app Android + web (PWA instalable).
  - III. Tests para la Lógica: Vitest → Jest con `jest-expo`; verificación manual en Android y web.
  - IV. TypeScript Estricto: `import.meta.env` → `process.env.EXPO_PUBLIC_*`.
  - V. Stack Estable, Dependencias por Mérito: redefinido (Expo, React Native, Expo Router,
    StyleSheet, lucide-react-native, `npx expo install`).
- Principios agregados:
  - VI. Un Solo Código, Multiplataforma (código de plataforma aislado en `src/platform`).
- Secciones modificadas:
  - Restricciones Técnicas: plataformas (Android + web), despliegue web (proyecto Vercel nuevo;
    traspaso del dominio propio al finalizar la migración), cabeceras COOP/COEP para SQLite web,
    distribución Android por APK con EAS Build, rutas con Expo Router, variables `EXPO_PUBLIC_*`.
  - Flujo de Desarrollo y Calidad: gates de typecheck, lint sin errores (proyecto sin deuda),
    Jest y export web; verificación manual en ambas plataformas y ambos modos.
- Secciones agregadas: Migración desde la App Vite.
- Secciones eliminadas: ninguna.
- Plantillas dependientes: plan/spec/tasks leen esta constitución en tiempo de ejecución;
  no requieren cambios.
- TODOs diferidos: ninguno. (Los de 1.x quedan sin efecto: la deuda de lint y el README
  pertenecen al repositorio Vite.)

Historial — 1.1.0:
- MINOR: Despliegue GitHub Pages → Vercel; base de rutas "/thinking-notes/" → "/";
  `npm test` en el workflow de CI.

Historial — 1.0.0:
- Principios definidos: I. Paridad Offline/Online, II. Experiencia Minimalista y Fluida,
  III. Tests para la Lógica, IV. TypeScript Estricto, V. Stack Estable, Dependencias por Mérito.
- Secciones agregadas: Restricciones Técnicas, Flujo de Desarrollo y Calidad, Gobernanza.
-->

# Constitución de Thinking Notes

Thinking Notes es una aplicación minimalista para capturar ideas rápidas organizadas en
notas y "thinkings". Se construye con Expo / React Native a partir de un único código y se
publica para Android y web (PWA). Funciona sin cuenta (almacenamiento local en SQLite) y,
con login de Google vía Supabase, sincroniza las notas con una API remota.

## Principios Fundamentales

### I. Paridad Offline/Online (NO NEGOCIABLE)

- Toda funcionalidad DEBE funcionar en ambos modos: sin sesión (persistencia local en
  SQLite mediante `expo-sqlite`, en Android y en web) y con sesión (persistencia remota vía
  la capa de servicios).
- El modo offline NUNCA DEBE depender del login, de la red ni de la API remota.
- Si la API remota falla, la app DEBE degradar a un estado usable (por ejemplo, datos
  locales) y no perder lo que el usuario escribió.
- Una funcionalidad que solo tenga sentido con sesión (por ejemplo, el perfil) DEBE
  justificarse explícitamente en la spec y no debe bloquear el flujo offline.
- Cada spec y plan DEBEN describir el comportamiento en los dos modos.

**Razón**: poder usar la app sin cuenta es parte de la propuesta de valor; la sesión
suma sincronización, no es un requisito para usarla. Usar SQLite en ambas plataformas
mantiene una sola implementación del almacenamiento local.

### II. Experiencia Minimalista y Fluida

- La interfaz DEBE mantenerse limpia y centrada en escribir: nada de pasos,
  confirmaciones ni pantallas que no aporten al flujo de captura de ideas.
- El guardado DEBE ser automático y el usuario DEBE ver en todo momento si sus cambios
  están pendientes o guardados.
- Las operaciones asíncronas (cargar, crear, editar, borrar) DEBEN mostrar un estado de
  carga y manejar el error de forma visible o recuperable; nunca fallar en silencio
  dejando la UI inconsistente.
- Las animaciones DEBEN ser sutiles y no bloquear la interacción.
- La interfaz DEBE ser cómoda tanto en el celular (app Android y web móvil) como en
  pantallas de escritorio (web).
- Los textos de la interfaz están en español.

**Razón**: el diferencial del producto es la sensación de rapidez y simpleza al
anotar.

### III. Tests para la Lógica

- La lógica nueva o modificada (hooks, servicios, contexto, utilidades, adaptadores de
  `src/platform`) DEBE tener tests automatizados con Jest (`jest-expo`), cubriendo como
  mínimo el caso feliz, los errores y ambos modos (offline/online) cuando aplique.
- Los componentes visuales PUEDEN verificarse de forma manual o con React Native Testing
  Library; la spec o las tareas DEBEN indicar los pasos de verificación manual, que se
  hacen en Android y en web.
- Un bug corregido en lógica DEBE venir con un test que lo reproduzca.
- La lógica traída de la app Vite DEBE traer también sus tests, adaptados a Jest.

**Razón**: la lógica de persistencia y sincronización es donde un error hace perder
notas; ahí los tests rinden más.

### IV. TypeScript Estricto

- El modo `strict` de TypeScript DEBE mantenerse activado.
- El código nuevo NO DEBE usar `any`; usar tipos concretos, `unknown` con validación o
  genéricos.
- Las formas de datos compartidas (notas, respuestas de la API, estados) DEBEN
  declararse en `src/types` o junto al servicio que las define, y las conversiones entre
  el formato remoto y el local DEBEN ser explícitas.
- Las variables de entorno DEBEN leerse vía `process.env.EXPO_PUBLIC_*` y validarse donde
  se usan.

**Razón**: el tipado estricto atrapa errores de forma de datos entre los dos modos de
persistencia antes de llegar al usuario.

### V. Stack Estable, Dependencias por Mérito

- El stack base es Expo (flujo administrado, sin carpetas `android/` versionadas) +
  React Native + TypeScript, navegación con Expo Router, estado global con Context API,
  estilos con `StyleSheet` de React Native, temas mediante un objeto de tokens en
  TypeScript, almacenamiento local con `expo-sqlite` e iconos de `lucide-react-native`.
- Por defecto, cada funcionalidad DEBE resolverse con el stack existente; ante una
  necesidad nueva se PREFIEREN los módulos del SDK de Expo.
- Las dependencias DEBEN instalarse con `npx expo install` para usar versiones
  compatibles con el SDK.
- Se PUEDE proponer una librería nueva cuando sea el camino más óptimo (menos código,
  mejor rendimiento, más robustez o mejor mantenibilidad). El plan DEBE justificarla:
  qué problema resuelve, qué alternativa con el stack actual se descartó, su costo
  (tamaño, mantenimiento) y si funciona en Android y en web.
- NO se agregan librerías por moda ni por preferencia sin una ventaja concreta.

**Razón**: un stack chico mantiene la app liviana y fácil de mantener, sin cerrarse a
mejoras reales.

### VI. Un Solo Código, Multiplataforma

- Cada componente, pantalla y pieza de lógica DEBE escribirse una sola vez y funcionar
  en Android y en web.
- Los componentes DEBEN usar primitivas de React Native (`View`, `Text`, `Pressable`,
  etc.); NO se usan elementos del DOM (`div`, `span`...) ni CSS.
- Todo acceso a APIs que existen en una sola plataforma (DOM, `window`, Web Audio,
  IndexedDB, módulos nativos, etc.) DEBE vivir en `src/platform`, detrás de una interfaz
  común con implementaciones `.web.ts` / `.native.ts`. El resto del código NO DEBE
  preguntar en qué plataforma corre (`Platform.OS`) salvo para ajustes visuales menores.
- Por defecto, cada funcionalidad DEBE comportarse igual en ambas plataformas. Una
  diferencia de comportamiento (por ejemplo, algo que solo existe con teclado físico en
  web) se PERMITE solo si la spec la declara y la justifica por escrito.

**Razón**: el motivo de migrar a Expo es mantener una sola app; el código de plataforma
disperso volvería a convertirla en dos.

## Restricciones Técnicas

- **Plataformas**: Android y web. iOS queda fuera de alcance hasta una enmienda que lo
  incorpore.
- **Despliegue web**: Vercel, con export estático de Expo (`web.output: "single"`),
  desplegado automáticamente en cada push a `main`. Durante la migración se usa un
  proyecto de Vercel nuevo con su URL `*.vercel.app`; la app Vite sigue en producción
  en su propio proyecto. Al cumplirse la condición de cierre de la migración, el dominio
  propio se traspasa del proyecto viejo al nuevo.
- **SQLite en web**: la configuración de Vercel DEBE servir las cabeceras COOP/COEP que
  requiere `expo-sqlite` en web; ningún cambio DEBE quitarlas.
- **PWA**: la versión web DEBE seguir siendo instalable; los cambios NO DEBEN romper el
  manifest ni la actualización del service worker.
- **Android**: se distribuye como APK generado con EAS Build. La publicación en Google
  Play queda fuera de alcance hasta una enmienda que la incorpore.
- **Rutas**: la navegación usa Expo Router; `src/app/` contiene solo pantallas y layouts,
  y el resto del código (componentes, hooks, servicios, utilidades) vive fuera de ella.
- **Capa de red**: toda llamada a la API remota DEBE pasar por `src/services`; los
  componentes no hacen `fetch` directo. La autenticación se hace solo con el cliente de
  Supabase (`lib/supabaseClient`).
- **Secretos**: la app solo puede contener valores públicos (`EXPO_PUBLIC_*`, como la
  anon key de Supabase). Ningún secreto de servidor DEBE llegar al bundle ni al repo;
  los valores viven en `.env.local`, en las variables del proyecto de Vercel y en las
  variables de entorno de EAS.

## Migración desde la App Vite

- La app Vite (repositorio `thinking-notes`) es la referencia de comportamiento: mientras
  dure la migración, la app Expo DEBE igualar lo que hace la app Vite, usando como
  criterios de aceptación los `spec.md` de las specs 001 a 005.
- Durante la migración NO se agregan funcionalidades nuevas ni rediseños: primero se
  iguala, después se mejora. Una mejora detectada se anota para una spec posterior.
- La migración se hace por capas (tipos y lógica pura → datos y servicios →
  `src/platform` → interfaz), cada una en su propia spec.
- **Condición de cierre**: la migración termina cuando todas las funcionalidades de la
  app Vite funcionan en Android y en web, en ambos modos, y los gates de calidad pasan.
  Recién entonces se traspasa el dominio y se archiva el repositorio Vite.
- No hace falta migrar datos locales de la app Vite: no hay usuarios que conservar.

## Flujo de Desarrollo y Calidad

- **Ramas**: el trabajo se hace en ramas `feat/...` o `fix/...` y entra a `main` por
  Pull Request.
- **Commits**: formato Conventional Commits en español (`feat:`, `fix:`, `ci:`,
  `docs:`, `refactor:`, `test:`).
- **Gates antes de mergear** (también corren en el workflow de CI):
  - `npx tsc --noEmit` DEBE pasar.
  - `npx expo lint` DEBE pasar sin errores (el proyecto arranca sin deuda de lint).
  - Los tests de Jest (`npm test`) DEBEN pasar.
  - `npx expo export --platform web` DEBE pasar.
  - La verificación manual de la UI indicada en la spec DEBE hacerse en Android
    (emulador o dispositivo) y en web, en ambos modos.
- **Idioma de la documentación**: constitución, specs, planes y tareas se escriben en
  español.
- **SDD**: las funcionalidades no triviales siguen el flujo de Spec Kit
  (specify → plan → tasks → implement); cada plan DEBE incluir el chequeo contra esta
  constitución.

## Gobernanza

- Esta constitución prevalece sobre cualquier otra práctica o convención del proyecto.
  Ante un conflicto, se cumple la constitución o se la enmienda primero.
- Las enmiendas se hacen con `/speckit-constitution`, quedan registradas en el Sync
  Impact Report y se commitean como `docs: amend constitution to vX.Y.Z (...)`.
- Versionado semántico:
  - MAJOR: se elimina o redefine un principio de forma incompatible.
  - MINOR: se agrega un principio o sección, o se amplía de forma material.
  - PATCH: aclaraciones y redacción sin cambio de significado.
- Cada plan (`/speckit-plan`) y revisión de PR DEBE verificar el cumplimiento. Toda
  excepción a un principio DEBE quedar justificada por escrito en el plan
  (sección de complejidad/excepciones).

**Version**: 2.0.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-16
