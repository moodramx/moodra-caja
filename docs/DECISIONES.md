# DECISIONES — Moodra $$

Formato: fecha · decisión · alternativa descartada · por qué.

## 2026-11-09 — Fase 0

### Desviaciones del PRD / CLAUDE.md (revísalas, Diego)

| Decisión                                                                                                  | Alternativa descartada                                               | Por qué                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript 6.0.3** en vez de la última estable (7.0.2).                                                 | TypeScript 7.0.                                                      | `typescript-eslint` 8.72 solo soporta `typescript <6.1`. Se sube a 7 cuando el linter lo soporte.                                                                                       |
| **`profiles.id` no es UUID v7**: es el `auth.uid()` que genera Supabase Auth (v4).                        | Forzar v7 en todas las tablas (convención PRD §6).                   | El id lo genera Auth; el resto de tablas sí usa `public.uuid_v7()`.                                                                                                                     |
| **`uuid_v7()` propia en SQL.**                                                                            | `uuidv7()` nativo.                                                   | Supabase local corre Postgres 17 y el nativo llega en Postgres 18.                                                                                                                      |
| **El perfil se crea con un trigger** sobre `auth.users` que lee `app_metadata`.                           | Que `admin-users` inserte en `profiles` después de crear el usuario. | Con el trigger, usuario y perfil nacen en la misma transacción: no pueden quedar usuarios sin perfil. `app_metadata` no la puede modificar el usuario.                                  |
| **Primer contador con script** (`pnpm crear-contador`).                                                   | Sembrarlo en `seed.sql`.                                             | `admin-users` exige que quien llama ya sea contador, y una contraseña no debe vivir en el repo.                                                                                         |
| **Animaciones con CSS en la Fase 0; Motion aún no se instala.**                                           | Instalar Motion desde ya (CLAUDE.md lo lista).                       | Los únicos movimientos hoy son la hoja inferior y los avisos, y CSS basta. Motion entra cuando haya gestos o la animación de éxito del POS (Fase 1–2), para cuidar el límite de 200 KB. |
| **Dexie, Recharts, exceljs, react-pdf y la caché persistida de TanStack Query no se instalan todavía.**   | Instalar todo el stack de una vez.                                   | Se agregan en la fase que los usa (outbox en Fase 1, reportes en Fase 5).                                                                                                               |
| **Tokens en CSS (`src/index.css`, `@theme` de Tailwind 4)**, con espejo mínimo en `src/design/tokens.ts`. | Solo `tokens.ts` (PRD §10).                                          | Tailwind 4 se configura en CSS; `tokens.ts` queda para usos desde JS (gráficas, PDF).                                                                                                   |
| **Tokens provisionales**: sans del sistema, acento blanco, radios propios.                                | Extraerlos ya de moodra.mx.                                          | Diego pasará la ruta o repo de la web. **Pendiente.**                                                                                                                                   |
| **Playwright corre con sesión simulada** y red interceptada.                                              | Solo e2e contra Supabase local.                                      | Prueba la app sin depender de Docker. El login real contra Supabase local se agrega cuando haya backend corriendo.                                                                      |

### Decisiones menores

| Decisión                                                                                    | Alternativa descartada                       | Por qué                                                                                                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Proyecto en `C:\dev\moodra-caja`.                                                           | Dejarlo en OneDrive.                         | OneDrive choca con `node_modules` de pnpm. La copia original sigue en el Escritorio.                                       |
| Rutas por archivos (TanStack Router) con code-splitting automático.                         | Rutas en código.                             | Divide el JS por ruta sin trabajo manual. `routeTree.gen.ts` se versiona para que el typecheck de CI no dependa del build. |
| El guard de sesión vive en el layout `_app`, no en `beforeLoad`.                            | `beforeLoad` con contexto del router.        | La sesión llega por un listener de Supabase; así la app abre sin red con la sesión guardada.                               |
| El último perfil se guarda en `localStorage`.                                               | Esperar la caché persistida de la Fase 1.    | Permite abrir la app sin señal desde hoy. Se migra a la caché de Dexie en la Fase 1.                                       |
| Desactivar usuario = `activo = false` + ban en Auth.                                        | Borrar el usuario.                           | Nada se borra; el historial sigue ligado a su perfil.                                                                      |
| Username: 2–24 caracteres `a-z 0-9 . _ -`, siempre en minúsculas.                           | Texto libre.                                 | Se vuelve la parte local de un email y debe ser único sin ambigüedad.                                                      |
| Contraseña mínima de 8 caracteres; registro público apagado (`enable_signup = false`).      | Default de Supabase (6, registro abierto).   | PRD §2: solo el contador crea usuarios.                                                                                    |
| `audit_log` con triggers que bloquean UPDATE, DELETE y TRUNCATE para cualquier rol.         | Solo RLS.                                    | La service role se salta RLS; el trigger no.                                                                               |
| `app_settings` de un solo renglón; `active_project_id` y `active_show_id` sin FK por ahora. | Crear `projects` y `shows` ya.               | Esas tablas llegan en las Fases 1 y 3; la FK se agrega entonces.                                                           |
| La Fase 0 crea solo el enum `user_role`.                                                    | Crear ya todos los enums del PRD.            | Cada enum nace con su tabla, para no adivinar valores.                                                                     |
| CI también corre Playwright y `prettier --check`.                                           | Solo lint, typecheck, Vitest y pgTAP (PLAN). | Cuesta poco y evita regresiones de UI.                                                                                     |
| Supabase CLI como dependencia del repo (`pnpm exec supabase`).                              | Instalación global.                          | Misma versión en la compu y en CI.                                                                                         |
| Ruta `/componentes` (en Más) para probar el design system en el celular.                    | Storybook.                                   | Cero dependencias; se puede quitar antes del lanzamiento.                                                                  |
| pnpm agregó `minimumReleaseAgeExclude` en `pnpm-workspace.yaml`.                            | Esperar a que los paquetes "maduren".        | pnpm 12 bloquea por default versiones publicadas hace muy poco; se exceptúan las versiones exactas que usamos hoy.         |

### Hallazgos de la verificación

- **Supabase gratis** sigue cubriendo el PRD §11: 500 MB de BD, 1 GB de storage, pausa a los 7 días sin actividad y máximo 2 proyectos activos (justo desarrollo + producción).
- **Netlify gratis** cambió a créditos. Según blogs de terceros son 300 al mes y 15 por deploy a producción (unos 20 deploys al mes). No se pudo confirmar en la página oficial: revisarlo al crear la cuenta. Conviene desplegar a producción solo desde `main`.
- **JS de la ruta de inicio**: ~180 KB gzip (límite 200 KB). El grueso es `supabase-js`. Hay que vigilarlo al sumar Dexie en la Fase 1.

### Pendientes para fases siguientes

- `bigint` en JSON: PostgREST manda los centavos como número. En la Fase 1 se convierten a `bigint` en la frontera (helper en `money.ts`) y los RPC reciben centavos como texto o entero.
- Supuestos del PRD §13 siguen abiertos (Passline, plataforma del amigo, nombre del becario).

## 2026-11-10 — Fase 0, verificación del backend

| Decisión                                                                                                                                                                                           | Alternativa descartada                      | Por qué                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El perfil nace del email interno**, como integrante; `admin-users` completa después nombre, rol, emoji y reparto. Reemplaza la decisión del 9 de noviembre de leer `app_metadata` en el trigger. | Trigger que lee `app_metadata` al insertar. | La prueba real mostró que Supabase Auth inserta el usuario y escribe `app_metadata` después, así que el trigger nunca la veía. Si el segundo paso falla, el usuario queda con el menor privilegio y se registra en la bitácora. |
| El cambio va en una migración nueva (`20261110000000_alta_perfil_por_email.sql`).                                                                                                                  | Editar la migración inicial.                | Regla del repo: nunca editar una migración ya aplicada.                                                                                                                                                                         |
| pgTAP usa usuarios propios (`pgtap-*`) y no supone una base vacía.                                                                                                                                 | Exigir `db reset` antes de probar.          | Las pruebas deben pasar aunque haya datos locales.                                                                                                                                                                              |
| Prueba Playwright real (`login-real.spec.ts`) solo con `E2E_REAL=1`; crea usuarios con nombre y contraseña aleatorios en cada corrida.                                                             | Credenciales de prueba fijas en el repo.    | Ninguna contraseña vive en el repo. Aún no corre en CI: pendiente al tener el repo en GitHub.                                                                                                                                   |
| `database.types.ts` es 100 % generado; los alias legibles viven en `src/lib/types.ts`.                                                                                                             | Editar el archivo generado.                 | `pnpm db:types` lo sobrescribe.                                                                                                                                                                                                 |
| Las Edge Functions las sirve `supabase start`; no hace falta `pnpm functions:serve` para probar.                                                                                                   | Terminal aparte con `functions serve`.      | Así lo hace el CLI 3.1; un paso menos.                                                                                                                                                                                          |

## 2026-11-10 — Tokens de diseño de moodra.mx

Origen: `Moodra Website/site/css/styles.css` y `site/index.html`. Cierra el pendiente de tokens provisionales.

| Decisión                                                                                                                                                  | Alternativa descartada                | Por qué                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Colores de la web: tinta `#0b0a0c`, superficies `#141216` y `#1e1b21`, hueso `#efe9df`, apagado `#a9a298`, línea hueso al 16 %, acento lavanda `#c9a7ff`. | Paleta provisional con acento blanco. | Es la identidad de la web.                                                                                                                                   |
| Botón principal y chip elegido en **hueso**; la lavanda queda para foco, interruptores, enlaces y el "$$".                                                | Lavanda como relleno principal.       | Así lo hace la web (`.btn--solid`): hueso de base, lavanda como acento.                                                                                      |
| Tipografías de la web: Fraunces (títulos y cifras, con SOFT 100 y WONK 1), Manrope (texto), IBM Plex Mono (etiquetas "01 — INICIO").                      | Sans del sistema.                     | Identidad de la web.                                                                                                                                         |
| Fuentes **autohospedadas** con Fontsource, solo subconjunto latino (~175 KB en total, se guardan en caché una vez).                                       | Google Fonts por CDN, como la web.    | La app debe abrir sin señal; un CDN externo no entra al precache. Fraunces pesa 121 KB por sus ejes variables: si estorba, se puede recortar a un peso fijo. |
| Radios: botones y chips de píldora, tarjetas 20 px, hojas 28 px, campos 16 px.                                                                            | Radios provisionales.                 | Son los más usados en la web.                                                                                                                                |
| Logo real de la banda en encabezado y login; ícono de la app = logo + "$$" en lavanda. `scripts/generar-marca.mjs` lo regenera.                           | Reusar el ícono de la web tal cual.   | Para distinguir la app de la web en la pantalla de inicio.                                                                                                   |
| El grano animado, el fondo líquido y el filtro de distorsión de la web **no** se traen.                                                                   | Copiar toda la estética.              | Cuestan batería y rendimiento en una herramienta de captura rápida (PRD §3.6).                                                                               |

## 2026-11-10 — Tema claro

| Decisión                                                                                                                          | Alternativa descartada                   | Por qué                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **La app es de fondo blanco con texto tinta.** Reemplaza el "modo oscuro único" del PRD §10 y de CLAUDE.md (que ya se actualizó). | Modo oscuro como la web.                 | Lo pidió Diego: quiere la app blanca y con todo el texto legible.                |
| Se conservan de moodra.mx las tipografías, las formas, el logo (versión negra) y el violeta como acento.                          | Rehacer la identidad.                    | Sigue siendo reconocible como Moodra.                                            |
| Acento `#8f1fb3` (el violeta de la web, oscurecido); la lavanda `#c9a7ff` ya no se usa para texto.                                | Lavanda como acento.                     | Sobre blanco la lavanda tiene contraste 1.9:1 y no se lee.                       |
| Todo color de texto cumple AA (≥ 4.5:1) sobre blanco y sobre las dos superficies; verde, ámbar y rojo se oscurecieron.            | Reusar los tonos pastel del tema oscuro. | Legibilidad. Contrastes medidos: tinta 19.8, apagado 8.4, tenue 6.0, acento 7.0. |
| Botón deshabilitado con fondo gris claro y texto gris oscuro, en vez de transparencia.                                            | Opacidad al 40 %.                        | Con transparencia el texto blanco quedaba ilegible.                              |
| Ícono de la app: logo negro sobre blanco con "$$" violeta.                                                                        | Mantener el ícono oscuro.                | Coherencia con la app.                                                           |
| Capturas de referencia en `docs/capturas/`.                                                                                       | No versionarlas.                         | Sirven para revisar el diseño sin levantar la app.                               |

## 2026-11-10 — Fase 1

### Desviaciones y huecos (revísalas, Diego)

| Decisión | Alternativa descartada | Por qué |
| --- | --- | --- |
| **El catálogo de cuentas, categorías y tipos de proyecto van en la migración**, no en `seed.sql`. | `seed.sql`, como dice CLAUDE.md. | `seed.sql` no se ejecuta en la nube; el catálogo debe existir ahí. |
| **Regresar dinero, pago a proveedor y reclasificación solo existen en la base** (con pruebas), sin pantalla. | Hacer las tres pantallas ya. | El plan de la Fase 1 lista cuatro flujos. Sin "Regresar dinero" el saldo "Te debemos" no se puede saldar desde la app todavía: conviene adelantarlo. |
| **Inicio pesa ~224 KB gzip de JS**, arriba de los 200 KB del PRD §3.6. | Recortar ya. | Dexie y la caché persistida suman ~35 KB. Se ataca en la auditoría de rendimiento de la Fase 6. |
| **Sin Zod en el cliente**: los tipos de TypeScript validan al capturar y la base valida todo al recibir. | Validar también con Zod en el celular. | Ahorra peso; la validación que cuenta es la del servidor. Zod sí se usa en las Edge Functions. |
| **Motion sigue sin instalarse.** | Instalarlo ya. | Las animaciones actuales son CSS. |
| **Cambiar el contexto activo requiere internet.** | Meterlo al outbox. | Es un ajuste compartido, no una captura; aplicarlo tarde confundiría a los demás. |
| **Se permite efectivo negativo** (gastar más efectivo de la banda del que dicen los libros). | Bloquear la captura. | Igual que el inventario negativo: nunca se bloquea al que captura; Inicio lo avisa y se aclara con un arqueo. |
| `show_id` existe en eventos y líneas pero sin llave foránea. | Crear `shows` ya. | La tabla llega en la Fase 3. |

### Reglas de negocio que definí

| Decisión | Por qué |
| --- | --- |
| Pagar o mover dinero **desde la caja** es solo del contador (es su custodio). | PRD §4.5. |
| Entregas **a la caja o al banco** las confirma el contador; si las captura él, cuentan de inmediato. | PRD §4.5: "lo confirma el contador al verlo". |
| **Regresar dinero** y **pagar a proveedor** desde la caja o la cuenta: solo contador. Desde el efectivo que uno trae: cualquiera. | La cuenta está a nombre de Diego. |
| No se puede regresar, pagar o reclasificar **más que el saldo** correspondiente. | Evita saldos al revés por error de dedo. |
| Anular una entrega **pendiente** la cancela sin asientos. Una **rechazada** no se anula. | No hay nada que revertir. |
| Evento capturado en un **mes cerrado**: entra con fecha de hoy, con nota y alerta en la bitácora. | PRD §8. |
| "Deshacer" antes de sincronizar **descarta** la captura en el celular; después, la anula en el servidor. | El servidor nunca la vio; no hace falta un asiento y su reversa. |
| Los montos viajan como número JSON (seguro hasta 2^53 centavos) y se manejan como `bigint` en el celular y en la base. | Cierra el pendiente de la Fase 0. |
| Realtime en `events`, `app_settings` y `projects`. | Feed, contexto y giras nuevas en vivo. |
| Todas las funciones de la base son privadas salvo las RPC listadas; las nuevas nacen privadas por default. | Ninguna función de posteo debe ser invocable desde el cliente. |
| Subcuentas por integrante: `1.1.1N`, `2.1.NN`, `2.4.NN`, `3.1.NN`, `3.2.NN`, numeradas por orden de alta. | PRD §5.1. |
| Las operaciones del outbox llevan un sello estrictamente creciente. | Una prueba mostró que capturar y deshacer en el mismo milisegundo podía perder la anulación. |
