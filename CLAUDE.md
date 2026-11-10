# CLAUDE.md — Moodra $$

## Qué es

Sistema contable de **gestión interna** para Moodra, banda de rock psicodélico instrumental: 4 integrantes, 1 becario y 1 contador/admin (el contador también es integrante). Por dentro es contabilidad de partida doble; por fuera es una interfaz "rockstar" sin lenguaje contable.

No es contabilidad fiscal: sin CFDI, sin IVA, todo en MXN. La spec completa está en `docs/PRD.md` y las fases en `docs/PLAN.md`.

## Stack

- **Frontend:** React + Vite + TypeScript (strict), con:
  - `vite-plugin-pwa` (Workbox) para la PWA
  - Tailwind CSS para estilos
  - Radix UI (primitives) para componentes base
  - Motion para animaciones
  - TanStack Router para rutas
  - TanStack Query para datos, con caché persistida en IndexedDB
  - Dexie (IndexedDB) para el outbox y la caché offline
  - Zod para validación
  - Recharts para gráficas
  - exceljs para exportar Excel y @react-pdf/renderer para PDF
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage y Edge Functions en Deno). Las migraciones se manejan con Supabase CLI.
- **IA:** Claude API, modelo `claude-haiku-5-5`, llamada **solo desde Edge Functions**. La API key vive en los secrets de Supabase.
- **Hosting:** Netlify, como sitio independiente de moodra.mx, en `caja.moodra.mx`.
- **CI/Ops:** GitHub Actions para tests, keep-alive diario de Supabase y respaldo semanal a Google Drive.
- **Objetivo de costo:** $0 MXN/mes más centavos de API.

## Estructura del repo

```
/apps/web
  /src/features/        un folder por módulo: inicio, gastos, cobros, pos, efectivo,
                        shows, proyectos, merch, fondo, reportes, admin
  /src/lib/offline/     outbox, sync, db Dexie
  /src/lib/money.ts     helpers de centavos y formato MXN
  /src/design/          tokens y componentes base
/supabase
  /migrations/          SQL versionado (nunca editar una migración ya aplicada)
  /functions/           Edge Functions
  /seed.sql             catálogo de cuentas, categorías, tipos de proyecto
  /tests/               pgTAP
/docs                   PRD, PLAN, DECISIONES, PROGRESO
/.github/workflows/
```

Es un monorepo simple con pnpm workspaces.

## Reglas contables (no negociables)

1. **Montos.** Siempre en `bigint` de centavos. En la UI se formatean con `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.
2. **Escritura del diario.** `journal_entries` y `journal_lines` solo se escriben vía funciones `SECURITY DEFINER` (familia `post_*`, invocadas desde `submit_event`). RLS niega INSERT, UPDATE y DELETE directos a todos los roles de cliente.
3. **Cuadre.** Todo asiento cuadra (Σ debe = Σ haber), validado con un constraint trigger diferido. Si no cuadra, la transacción aborta.
4. **Inmutabilidad.** No hay UPDATE ni DELETE de eventos ni de asientos registrados. Para corregir se usa `void_event(event_id, motivo)`, que genera la reversa y marca el evento como anulado; después se captura el correcto.
5. **Un evento, un asiento.** Cada evento de negocio produce exactamente un asiento, ligado por `source_event_id`. La única excepción es la entrega de efectivo, que se postea al confirmarse.
6. **Periodos.** Son mensuales y se cierran. No se puede registrar con fecha en un periodo cerrado. Si se anula un evento de un periodo cerrado, la reversa cae en el periodo abierto actual.
7. **Inventario.** Se valúa a costo promedio ponderado por variante, recalculado en cada entrada.
8. **Bitácora.** `audit_log` registra toda acción: quién, cuándo, dispositivo y payload.
9. **Dimensiones.** Cada línea de asiento lleva, cuando aplica, `member_id`, `project_id`, `show_id` y `variant_id`. Los reportes por show, gira y proyecto salen de estas dimensiones, no de cuentas separadas.

## Reglas offline / sync

- **Primero local.** Toda captura se guarda primero en el outbox de Dexie con un `client_id` (UUID v7 generado en el cliente) y se muestra de inmediato en la UI, con el estado "pendiente de sincronizar".
- **Idempotencia.** El sync llama la RPC `submit_event(client_id, type, payload, captured_at)`. Si el `client_id` ya existe, devuelve el resultado previo sin duplicar.
- **Fecha contable.** Es `captured_at` (cuando pasó), no la fecha de sincronización.
- **Fotos.** Se comprimen en el cliente (máx. 1600 px, WebP de ~200 KB) y suben aparte; el evento no espera a la foto.
- **Lecturas.** Usan la caché persistida; al reconectar, Realtime e invalidaciones refrescan.
- **Inventario negativo.** Se permite offline; genera una alerta al contador, nunca bloquea una venta.

## UX

- **Idioma y tono.** Español de México, cercano. Cero jerga contable en la vista de integrante.
- **Tema.** Modo claro único (fondo blanco, decisión de Diego del 2026-11-10; reemplaza el modo oscuro del PRD §10). Tipografías y formas se toman de moodra.mx. Todo texto debe cumplir contraste AA.
- **Rapidez.** Registrar un gasto en ≤ 3 toques más el monto. Targets táctiles ≥ 48 px. Teclado numérico propio para montos.
- **Confirmaciones.** Toda acción de dinero muestra un resumen en lenguaje humano antes de guardar, con toast de "Deshacer" (que en realidad anula) durante 10 s.

## Calidad

- TypeScript strict, ESLint y Prettier.
- **pgTAP** para cada función de posteo. Casos mínimos: el asiento cuadra, usa las cuentas correctas, es idempotente, se anula bien, respeta el periodo cerrado y respeta los permisos RLS.
- **Vitest** para la lógica del cliente (money, outbox, sync).
- **Playwright** para los flujos clave en viewport móvil (390×844).
- Tipos de BD generados con `supabase gen types`.
- Commits pequeños y descriptivos. No se avanza de fase sin pruebas en verde.

## Seguridad

- Sin registro público: solo el contador crea usuarios (Edge Function con service role).
- La service role key y la Claude API key viven solo en Edge Functions y secrets. Nunca en el cliente ni en el repo.
- Storage privado con URLs firmadas.
