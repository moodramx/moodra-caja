# PLAN — Moodra $$ por fases

**Reglas del plan:**

- Una fase a la vez. Al terminar cada una: todas las pruebas en verde, `docs/PROGRESO.md` actualizado con instrucciones para probar en el celular, y te detienes hasta que Diego apruebe.
- La arquitectura offline (outbox + `submit_event` idempotente) existe **desde la Fase 1**. Todas las capturas pasan por ahí aunque el pulido offline llegue en la Fase 6.

---

## Fase 0 — Cimientos

- Monorepo con pnpm, la app Vite + React + TS strict, ESLint y Prettier.
- Proyecto Supabase local con CLI: migración inicial con enums, `profiles`, `app_settings` y `audit_log`.
- Auth con usuario + contraseña (username → email interno) y Edge Function `admin-users`.
- PWA base: manifest, íconos, service worker y prompt de instalación con guía para iOS.
- Design system: tokens (§10 del PRD), tipografía, componentes base (botón, chip, bottom sheet, toast, teclado de monto) y layout móvil con navegación inferior.
- Esqueleto de rutas: Inicio, Movimientos, Merch, Reportes, Más (+ Modo contador).
- CI en GitHub Actions: lint, typecheck, Vitest y pgTAP.
- Deploy de preview en Netlify.

**Aceptación:** puedo instalar la PWA en mi iPhone y en un Android, entrar con mi usuario y ver el Inicio vacío con la identidad de Moodra. El contador puede crear los 5 usuarios.

## Fase 1 — Núcleo contable + captura básica

- Migraciones:
  - `accounts` (seed completo del §5.1, con subcuentas por integrante autogeneradas)
  - `periods`, `journal_entries` y `journal_lines` con el constraint de cuadre
  - `categories` (seed §4.2), `project_types`, `projects`, `contacts`
  - `events` y los detalles de gasto, ingreso, `cash_transfers` y `fund_movements`
- RPCs: `submit_event`, `void_event`, `confirm_cash_transfer`.
- Funciones de posteo para: gasto (todas las variantes de pago y `settlement_pref`), cobro/ingreso, entrega de efectivo con confirmación, depósito, "puse dinero" (préstamo/aportación), reclasificación, regresar dinero y pago a proveedor.
- Cliente:
  - outbox en Dexie
  - sync idempotente
  - UI optimista
  - flujos Gasté, Cobré, Pasé efectivo y Puse dinero
  - Inicio con saldos personales, saldo de banda, feed en vivo (Realtime) e indicador de sync
- Contexto activo (proyecto/show) sincronizado por Realtime.
- Vista contador mínima: libro diario y balanza.
- pgTAP: cada mapeo del §5.3 implementado, idempotencia, anulación, permisos de la tabla §7 y regla de 24 h.

**Aceptación:**
- Registro un gasto con mi dinero en modo avión; al volver la señal se sincroniza una sola vez y aparece en el celular de otro integrante sin recargar.
- Una entrega de efectivo no afecta saldos hasta que el receptor confirma.
- La balanza siempre cuadra.

## Fase 2 — Merch, POS e inventario

- Productos y variantes con foto, ubicación "Bodega Apnea" e inventario con costo promedio ponderado.
- Compra/entrada de merch, regalo, merma y ajuste por conteo.
- POS completo:
  - grid, variantes, carrito
  - toggle de regalo
  - efectivo/transferencia
  - quién cobró y canal
  - funcionamiento offline con precios y stock en caché
- Resumen de la noche y alertas de stock bajo o negativo.
- Anulación de venta que repone inventario a costo original.
- pgTAP de costo promedio y de los asientos de venta, regalo y merma.

**Aceptación:**
- Vendo 3 playeras (una de regalo) offline. Al sincronizar, el inventario, el costo de venta, el merch regalado y el efectivo en mi poder cuadran al centavo.
- Anular la venta deja todo como estaba.

## Fase 3 — Shows, giras y proyectos

- Catálogo de proyectos (seed §4.6), shows con tipos de deal y cálculo de ingreso esperado.
- Plataformas de boletaje (seed con placeholders).
- Asistente de cierre de show:
  - fee, %, boletaje propio y sin pago
  - destino del dinero o pendiente
  - pagos a terceros
  - resultado del show en pantalla
- Cobros anticipados, liquidación de boleteras y venues, y pendientes de cierre en Inicio.
- Vistas `v_show_pnl` y `v_project_pnl`.

**Aceptación:**
- Creo una gira con 3 shows de deals distintos y los cierro.
- La gira muestra su resultado consolidado, incluyendo merch.
- Los por cobrar de boletera se saldan al registrar la liquidación.

## Fase 4 — Captura inteligente (IA)

- Edge Functions `parse-receipt` y `parse-text` con Claude API (`claude-haiku-5-5`), salida validada con Zod y resaltado de baja confianza.
- Foto de ticket en "Gasté" con compresión, cola offline y prellenado.
- Campo "Dime qué pasó" en Inicio: propone gasto, ingreso, venta o entrega en una tarjeta editable.
- Registro de tokens usados por llamada en una tabla `ai_usage`, con vista de costo mensual para el contador.
- Pruebas con un set de 15 tickets reales de ejemplo (Diego los proveerá) y 20 frases.

**Aceptación:**
- ≥ 85% de los tickets de prueba con monto y categoría correctos sin tocar nada.
- Ninguna captura se postea sin confirmación.

## Fase 5 — Contador: reportes, repartos y cierre

- Dashboard del contador en tiempo real (§4.13) con alertas.
- Reportes 1–10 del §4.14 con filtros y export a Excel (exceljs) y PDF (con la identidad de Moodra).
- Liquidación de gira con "quién le debe a quién" y mínimo de transferencias.
- Repartos: preview y ejecución en partes iguales entre quienes tienen `participa_reparto = true`, con compensaciones.
- Plantilla recurrente "Sueldo becario $7,000" con confirmación mensual.
- Arqueos de efectivo, asiento manual, cierre/reapertura de mes y cierre de año.
- Catálogos editables (cuentas, categorías, tipos de proyecto, plataformas, contactos, usuarios).
- Dashboards simplificados para integrantes.

**Aceptación:**
- Con datos de prueba de un mes con gira, los reportes cuadran entre sí: el resultado del estado de resultados es igual a la variación del patrimonio, y el flujo de efectivo es igual a la variación de 1.1 + 1.2.
- Los exports se abren bien en Excel y en el visor de PDF del iPhone.

## Fase 6 — Offline robusto, notificaciones, ops y lanzamiento

- Endurecer offline: Background Sync (Android), reintentos con backoff, pruebas Playwright con red cortada y reconexión, y eventos en periodo cerrado.
- Web Push (VAPID): todas las notificaciones del §4.15, preferencias por usuario y resumen nocturno de gira con pg_cron.
- GitHub Actions:
  - keep-alive diario
  - respaldo semanal (`pg_dump` + Excel) a Google Drive, con retención de 12 semanas
  - documentar cómo restaurar
- Onboarding para integrantes (3 pantallas, guía de instalación en iOS/Android) y textos UX revisados.
- Auditoría de rendimiento (Lighthouse móvil ≥ 90 en Performance y PWA) y de accesibilidad.
- Deploy a producción en `caja.moodra.mx`: DNS en GoDaddy → Netlify, y Supabase de producción separado del de desarrollo.
- `docs/MANUAL-INTEGRANTE.md` (1 página, para rockstars) y `docs/MANUAL-CONTADOR.md` (completo).

**Aceptación:**
- Los 5 usuarios usan la app durante un show real.
- Al día siguiente, la liquidación del show y los saldos por integrante salen sin ajustes manuales.
- Existe al menos un respaldo restaurado con éxito en un proyecto de prueba.
