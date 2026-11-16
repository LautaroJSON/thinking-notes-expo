# Feature Specification: Migración etapa 1 — fundamentos y modo sin cuenta

**Feature Branch**: `feat/006-expo-offline-foundation`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Migración — etapa 1: fundamentos y modo sin cuenta (offline). Trae la base de la app desde la app Vite (`~/codigo/Proyectos/thinking-notes`) y deja funcionando las notas sin sesión, en Android y en web, con almacenamiento local en SQLite. Incluye infraestructura de tests, tipos del dominio, utilidades puras, persistencia local, lógica de notas en modo sin cuenta, cabeceras COOP/COEP para la web y una pantalla temporal de verificación. No incluye interfaz definitiva."

## Contexto y alcance

Esta es la primera spec de la migración por capas definida en la constitución
(sección "Migración desde la App Vite"): **tipos y lógica pura → datos y servicios →
`src/platform` → interfaz**. Cubre la primera capa completa y la parte local de la
segunda.

- **Referencia de comportamiento**: la app Vite. En particular `src/types`,
  `src/components/utils/{index,dates,reorder,noteLaunch,dictation,copyNote}.ts`,
  `src/context/notesContext.tsx`, `src/context/notes-context.ts`, `src/hooks/useNotes.ts`
  y `src/hooks/useDebounce.ts`, con sus tests.
- **Criterios heredados**: el `spec.md` de la spec 002 (reordenar notas) en lo que toca a
  la lógica de orden y su persistencia sin sesión.

### Excepción declarada al principio I (Paridad Offline/Online)

Esta etapa implementa **solo el modo sin cuenta**. El modo con sesión (login, Supabase,
API remota, sincronización) llega en la spec 007. Para no cerrar ese camino, la lógica de
notas DEBE quedar organizada de forma que el modo con sesión se pueda sumar sin reescribir
la lógica sin cuenta: el estado de sesión existe (`cargando` / `sin sesión` / `con sesión`)
aunque en esta etapa siempre resuelva a "sin sesión", y el lugar donde se leen y guardan
las notas es intercambiable según el modo. El plan DEBE registrar esta excepción en su
sección de complejidad/excepciones.

### Fuera de alcance

- Sesión, login con Google, Supabase y sincronización remota → spec 007.
- Imágenes en thinkings (agregar, editar, borrar y limpieza de archivos), sonidos,
  dictado por voz (solo se trae su lógica pura), exportar a PDF, temas y adaptadores de
  `src/platform` → specs 008+.
- Borradores del cuadro "nuevo pensamiento" (`drafts.ts`), búsqueda de notas y
  animaciones de la nota → specs posteriores.
- Interfaz definitiva (sidebar, editor, arrastrar para reordenar) → specs 009+.
- Migrar datos locales de la app Vite: no hay usuarios que conservar (constitución).

### Restricción de producto

Los thinkings dentro de una nota **no se reordenan**. Solo se reordenan las notas de la
lista (spec 002).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mis notas sin cuenta sobreviven al cerrar la app (Priority: P1)

Como persona que usa la app sin iniciar sesión, quiero crear una nota, ponerle título y
escribir thinkings, y que todo siga ahí cuando cierro y vuelvo a abrir la app en Android
o recargo la página en la web.

**Why this priority**: es el núcleo del producto en modo sin cuenta. Sin persistencia
local confiable no hay app: todo lo demás se apoya en esto.

**Independent Test**: en la pantalla de verificación, crear una nota, cambiarle el título
y agregar dos thinkings; esperar a que figure como guardada; cerrar la app por completo
(Android) o recargar la página (web) y comprobar que la nota, su título y sus thinkings
siguen iguales y en el mismo orden.

**Acceptance Scenarios**:

1. **Given** la app abierta sin sesión y sin notas, **When** creo una nota, **Then**
   aparece en la lista con el título "Nueva Nota :)", sin thinkings, con fecha de
   creación y de modificación, y queda como nota activa.
2. **Given** una nota activa, **When** cambio su título o agrego, edito o borro un
   thinking de texto, **Then** el cambio se guarda solo, sin acción explícita, y el
   estado pasa de "pendiente" a "guardado".
3. **Given** notas guardadas, **When** cierro y reabro la app en Android o recargo la
   página en web, **Then** veo las mismas notas, con el mismo contenido y orden.
4. **Given** una nota guardada, **When** la borro, **Then** desaparece de la lista, deja
   de ser la nota activa y no vuelve a aparecer al reabrir la app.
5. **Given** una nota con cambios, **When** se guarda, **Then** su fecha de modificación
   se actualiza; la fecha de creación no cambia.

---

### User Story 2 - Reordenar las notas de la lista (Priority: P2)

Como persona que usa la app sin cuenta, quiero mover una nota a otra posición de la
lista y que ese orden se conserve, igual que en la app Vite (spec 002).

**Why this priority**: es comportamiento existente que hay que igualar, pero la app es
usable sin él.

**Independent Test**: con tres notas, mover la tercera a la primera posición desde la
pantalla de verificación, reabrir la app y comprobar que el orden nuevo se mantiene.

**Acceptance Scenarios**:

1. **Given** las notas A, B, C, **When** muevo C a la posición de A, **Then** el orden
   queda C, A, B y se conserva al reabrir la app.
2. **Given** una nota, **When** la "muevo" a su misma posición o a una nota inexistente,
   **Then** no cambia nada ni se guarda nada.
3. **Given** que guardar el orden falla, **When** muevo una nota, **Then** la lista vuelve
   al orden anterior sin perder cambios de contenido hechos mientras tanto, y se informa
   el error "No se pudo guardar el orden de las notas.", que se puede descartar.
4. **Given** cualquier nota, **When** la reordeno, **Then** su fecha de modificación no
   cambia.

---

### User Story 3 - Datos con formato viejo se normalizan al cargar (Priority: P2)

Como persona con notas guardadas en un formato anterior (thinkings como lista de textos
simples, ids repetidos o elementos inválidos), quiero que la app las cargue igual que la
app Vite: convertidas al formato actual, sin perder contenido válido.

**Why this priority**: protege los datos ante cambios de formato; es la regla que hoy
aplica la carga de notas y debe seguir valiendo con el almacenamiento nuevo.

**Independent Test**: con tests automáticos que cargan notas en formato viejo desde el
almacenamiento local y verifican el resultado normalizado y que se reescribe una sola vez.

**Acceptance Scenarios**:

1. **Given** una nota guardada con thinkings `["uno", "dos"]`, **When** se cargan las
   notas, **Then** se obtienen dos thinkings de texto con ids únicos nuevos, en el mismo
   orden, y el almacenamiento se reescribe con el formato nuevo una sola vez.
2. **Given** thinkings válidos en el formato actual, **When** se cargan, **Then** quedan
   idénticos y el almacenamiento no se reescribe.
3. **Given** thinkings inválidos (nulos, números, sin id, imágenes vacías o con más de 5
   imágenes, texto no textual), **When** se cargan, **Then** se descartan con un aviso y
   se conservan los válidos.
4. **Given** un thinking de un tipo desconocido, **When** se carga, **Then** se conserva
   tal cual.
5. **Given** dos thinkings con el mismo id, **When** se cargan, **Then** el segundo recibe
   un id nuevo.
6. **Given** una nota sin título, id o fechas válidas, **When** se carga, **Then** el
   título queda vacío y los campos opcionales ausentes, igual que en la app Vite.

---

### User Story 4 - Lo escrito no se pierde si falla el almacenamiento (Priority: P2)

Como persona que escribe en la app, quiero que si el almacenamiento local falla al leer o
al guardar, no se pierda lo que escribí y la app me muestre que algo no se guardó.

**Why this priority**: el principio I exige no perder lo escrito; perder notas es el peor
error posible de la app.

**Independent Test**: con tests automáticos que simulan fallas de lectura y escritura del
almacenamiento local y verifican el estado resultante.

**Acceptance Scenarios**:

1. **Given** que guardar una nota falla, **When** se intenta el guardado automático,
   **Then** el contenido sigue en pantalla, no se marca como guardado, se registra el
   error y el siguiente guardado vuelve a intentar con el contenido más reciente.
2. **Given** que crear o borrar una nota no se puede guardar, **When** ocurre la falla,
   **Then** la lista en pantalla refleja la acción del usuario y el error queda
   registrado (igual que en la app Vite).
3. **Given** que leer las notas falla al abrir la app, **When** termina la carga, **Then**
   la app queda usable con la lista vacía, informa el error y **no** sobrescribe con una
   lista vacía las notas que pudieran estar guardadas.

---

### User Story 5 - Base del proyecto lista para seguir migrando (Priority: P1)

Como desarrollador, quiero que el proyecto tenga tests automáticos funcionando, los tipos
del dominio y las utilidades puras de la app Vite con sus tests, y la web configurada
para el almacenamiento local, para poder migrar las capas siguientes sobre una base
verificada.

**Why this priority**: sin esta base no se pueden cumplir los gates de calidad de la
constitución ni las specs siguientes.

**Independent Test**: correr los gates (`npx tsc --noEmit`, `npx expo lint`, `npm test`,
`npx expo export --platform web`) en un clon limpio y verificar que pasan; abrir la web en
desarrollo y en el despliegue y comprobar que se sirven las cabeceras de aislamiento.

**Acceptance Scenarios**:

1. **Given** el repositorio, **When** se corre `npm test`, **Then** se ejecutan los tests
   de tipos, utilidades, almacenamiento y lógica de notas, y pasan.
2. **Given** los tests de la app Vite para `thinking`, `dates`, `reorder`, `noteLaunch`,
   `dictation`, `copyNote`, `useDebounce`, la carga de notas y el contexto de notas,
   **When** se corren adaptados en este proyecto, **Then** cubren los mismos casos
   (excepto los de funcionalidades fuera de alcance) y pasan.
3. **Given** la web en desarrollo o desplegada, **When** se pide cualquier página,
   **Then** la respuesta incluye las cabeceras de aislamiento entre orígenes
   (Cross-Origin-Opener-Policy `same-origin` y Cross-Origin-Embedder-Policy
   `require-corp`) que necesita el almacenamiento local en web.

---

### User Story 6 - Pantalla temporal de verificación (Priority: P3)

Como desarrollador, quiero una pantalla mínima para listar, crear, editar y borrar notas y
thinkings, y reordenar notas, para probar a mano la persistencia en Android y en web antes
de que exista la interfaz definitiva.

**Why this priority**: es descartable; solo sirve para la verificación manual que exige
la constitución.

**Independent Test**: seguir los pasos de verificación manual (abajo) en Android y en web.

**Acceptance Scenarios**:

1. **Given** la pantalla de verificación, **When** la uso, **Then** puedo: ver la lista de
   notas; crear una; abrirla como activa; editar el título; agregar, editar y borrar
   thinkings de texto; borrar la nota; mover una nota hacia arriba o abajo; y ver si hay
   cambios pendientes o guardados.
2. **Given** la pantalla, **When** se revisa el código, **Then** usa solo primitivas de
   React Native y está marcada como temporal, a reemplazar en la etapa de interfaz.

### Edge Cases

- **Primera apertura sin datos**: la lista arranca vacía sin errores.
- **Carga fallida**: la lista queda vacía y usable, se informa el error y nada guardado se
  sobrescribe (ver User Story 4).
- **Cambios rápidos seguidos**: el guardado automático espera 2 segundos sin cambios
  (como el editor de la app Vite) y guarda la última versión; cambios intermedios no
  generan guardados con contenido viejo.
- **Cerrar o cambiar de nota con cambios pendientes**: se guarda de inmediato la versión
  pendiente antes de dejar la nota (desvío declarado respecto de la app Vite; ver
  Assumptions).
- **Thinkings de imagen o de tipo desconocido ya guardados**: se cargan, se conservan y
  se vuelven a guardar intactos aunque esta etapa no permita crearlos ni editarlos.
- **Reordenar con ids inexistentes o la misma posición**: no hace nada.
- **Borrar la nota activa**: deja de haber nota activa.
- **Muchas notas** (cientos): carga y guardado siguen sin demoras perceptibles.
- **Web sin aislamiento entre orígenes** (cabeceras ausentes): el almacenamiento local no
  funciona; por eso las cabeceras son requisito tanto en desarrollo como desplegada.

## Requirements *(mandatory)*

### Functional Requirements

**Base del proyecto**

- **FR-001**: El proyecto DEBE tener tests automáticos ejecutables con `npm test`, que
  funcionen para código de Android y web.
- **FR-002**: Los tipos del dominio (notas, thinkings de texto, imagen y desconocidos,
  estado de sesión, estado de espera) y la normalización de thinkings DEBEN traerse de la
  app Vite sin cambiar su comportamiento observable.
- **FR-003**: Las utilidades puras `dates`, `reorder`, `noteLaunch`, `dictation` y
  `copyNote` DEBEN traerse tal cual, con sus tests adaptados, sin depender de APIs de una
  sola plataforma. Los tipos que necesiten de otros módulos (por ejemplo, el identificador
  de animación que usa `noteLaunch`) se traen como tipos, sin la lógica asociada.

**Persistencia local**

- **FR-004**: Las notas sin sesión DEBEN guardarse en el almacenamiento local de la app,
  el mismo en Android y en web, y sobrevivir a cerrar/reabrir la app y a recargar la
  página.
- **FR-005**: Se DEBEN guardar por nota: id, título, lista ordenada de thinkings, fecha de
  creación y fecha de modificación, y el orden de las notas en la lista.
- **FR-006**: Al cargar, DEBE aplicarse la misma normalización que la app Vite (formato
  viejo de thinkings, elementos inválidos, ids repetidos, campos opcionales ausentes); si
  algo cambió, el almacenamiento DEBE reescribirse una sola vez con el resultado.
- **FR-007**: Una falla de lectura NO DEBE provocar que se sobrescriban datos guardados;
  una falla de escritura NO DEBE descartar lo que el usuario escribió en memoria.

**Lógica de notas (modo sin cuenta)**

- **FR-008**: El usuario DEBE poder crear una nota (título inicial "Nueva Nota :)", sin
  thinkings, id único, fechas de creación y modificación), que pasa a ser la activa y se
  agrega al final de la lista.
- **FR-009**: El usuario DEBE poder seleccionar una nota como activa, cerrarla, editar su
  título y agregar, editar y borrar thinkings de texto.
- **FR-010**: Los cambios de la nota activa DEBEN guardarse automáticamente tras 2
  segundos sin cambios, y de inmediato al cerrar o cambiar de nota o al borrar un
  thinking; el guardado actualiza la fecha de modificación.
- **FR-011**: La app DEBE exponer en todo momento si hay cambios pendientes de guardar o
  si todo está guardado, y el estado de carga inicial de las notas.
- **FR-012**: El usuario DEBE poder borrar una nota; si era la activa, deja de haber nota
  activa.
- **FR-013**: El usuario DEBE poder mover una nota a la posición de otra; el orden se
  guarda, no cambia fechas de modificación y, si el guardado falla, se revierte al orden
  anterior conservando cambios de contenido y se expone un error descartable.
- **FR-014**: Los thinkings dentro de una nota NO DEBEN poder reordenarse.
- **FR-015**: La lógica de notas DEBE exponerse a la interfaz con la misma forma de uso
  que en la app Vite (proveedor de contexto + `useNotes`, que falla con un mensaje claro
  si se usa fuera del proveedor), sin las operaciones de imágenes, que quedan para su
  spec.
- **FR-016**: El estado de sesión DEBE existir con los valores `cargando`, `sin sesión` y
  `con sesión`; en esta etapa siempre resuelve a `sin sesión` y la lógica DEBE permitir
  sumar el modo con sesión cambiando solo dónde se leen y guardan las notas.

**Web**

- **FR-017**: La web DEBE servir las cabeceras `Cross-Origin-Opener-Policy: same-origin`
  y `Cross-Origin-Embedder-Policy: require-corp` en desarrollo y en el despliegue de
  Vercel.

**Verificación**

- **FR-018**: DEBE existir una pantalla temporal de verificación con las acciones de la
  User Story 6, escrita solo con primitivas de React Native y marcada para reemplazo.
- **FR-019**: Los tests automáticos DEBEN cubrir el caso feliz y los errores de: tipos y
  normalización, utilidades puras, guardado debounced, carga y guardado local (incluidas
  fallas de lectura y escritura) y la lógica de notas (crear, editar, borrar, reordenar).

### Key Entities

- **Nota**: id único, título, lista ordenada de thinkings, fecha de creación y fecha de
  última modificación del contenido (no cambia al reordenar). Tiene una posición en la
  lista de notas.
- **Thinking**: idea dentro de una nota, con id único dentro de la nota. Puede ser de
  texto, de imagen (1 a 5 referencias + texto opcional) o de un tipo desconocido que se
  conserva intacto. Su orden dentro de la nota es el de creación y no se cambia.
- **Estado de sesión**: `cargando`, `sin sesión` o `con sesión`.
- **Estado de espera**: qué operación asíncrona está en curso (cargar, crear, borrar,
  editar, reordenar, subir imágenes, ninguna), igual que en la app Vite.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las notas creadas o editadas sin sesión, una vez marcadas como
  guardadas, siguen idénticas tras cerrar y reabrir la app en Android y tras recargar la
  página en web.
- **SC-002**: El 100 % de los casos de normalización que cubren los tests de la app Vite
  dan el mismo resultado en esta app.
- **SC-003**: Ante una falla simulada de escritura, el 0 % del contenido escrito se
  pierde de lo que se muestra al usuario, y ninguna falla de lectura borra datos
  guardados.
- **SC-004**: Un cambio queda guardado a más tardar 3 segundos después de dejar de
  escribir.
- **SC-005**: Con 200 notas guardadas, la lista aparece en menos de 1 segundo al abrir la
  app en un dispositivo Android de gama media.
- **SC-006**: Los cuatro gates de calidad (typecheck, lint, tests, export web) pasan sin
  errores en un clon limpio.

## Verificación manual (Android y web)

Hacer en un emulador o dispositivo Android y en la web (desarrollo y despliegue):

1. Abrir la app sin notas: la lista está vacía y no hay errores.
2. Crear tres notas; cambiar el título de una y agregarle tres thinkings.
3. Esperar a ver "guardado"; editar el segundo thinking y borrar el tercero.
4. Mover la tercera nota al primer lugar.
5. Cerrar la app por completo (Android) o recargar la página (web) y comprobar notas,
   títulos, thinkings y orden.
6. Borrar una nota y volver a reabrir/recargar: no reaparece.
7. En web, comprobar en las herramientas del navegador que las respuestas traen las
   cabeceras COOP/COEP.

## Assumptions

- El retraso de guardado automático es de 2 segundos, el valor que usa el editor de la
  app Vite.
- En la app Vite, una falla al guardar marca el estado como "guardado" igual. Acá se
  mantiene como "pendiente" y se reintenta en el siguiente guardado: es lo que exigen los
  principios I y II de la constitución ("no perder lo escrito", "ver si está pendiente o
  guardado") y no agrega funcionalidad nueva.
- En la app Vite, cerrar o cambiar de nota antes de que venza el debounce descarta el
  temporizador y los cambios de esos últimos 2 segundos no se guardan. Acá se guardan de
  inmediato al dejar la nota (FR-010): es la misma regla del principio I y no cambia la
  experiencia.
- En la app Vite, una falla de lectura deja la lista vacía y la siguiente escritura podía
  pisar los datos guardados. Acá la lista también queda vacía, pero no se sobrescribe lo
  guardado (requisito explícito del pedido: no perder lo escrito).
- La demora simulada de 3 segundos que la app Vite aplica a la carga sin sesión en
  desarrollo no se trae: era solo para ver la animación de carga, que pertenece a la
  etapa de interfaz.
- Los sonidos de crear/borrar, los borradores y la limpieza de imágenes que hoy dispara
  la lógica de notas se omiten en esta etapa; sus specs los reconectan.
- No hace falta importar datos de la app Vite (constitución). La normalización de formato
  viejo se conserva por si se cargan datos antiguos y como red de seguridad.
- El despliegue web usa un proyecto de Vercel nuevo, como indica la constitución.
