# PROGRESO — Moodra $$

## Fase 0 — Cimientos · 2026-11-09 · **incompleta: falta verificar el backend y desplegar**

### Hecho y verificado en esta compu

- Monorepo pnpm (`apps/web`), Vite 8 + React 19 + TypeScript strict, ESLint y Prettier.
- PWA: manifest, íconos, service worker y guía de instalación para iOS y Android.
- Design system: tokens provisionales, botón, chip, hoja inferior, avisos con "Deshacer" (10 s), teclado de monto y layout móvil con navegación inferior.
- Rutas: Inicio, Movimientos, Merch, Reportes, Más, Modo contador → Usuarios, y `/componentes`.
- Login con usuario + contraseña (username → `username@caja.moodra.mx`).
- Pruebas en verde: **Vitest 23/23**, **Playwright 11/11** (390×844, con sesión simulada), lint y typecheck limpios.

### Escrito pero SIN ejecutar (falta Docker)

- Migración `supabase/migrations/20261109000000_cimientos.sql`: enum `user_role`, `profiles`, `app_settings`, `audit_log`, RLS y trigger de alta.
- Pruebas pgTAP `supabase/tests/000_cimientos.test.sql` (27 casos).
- Edge Function `supabase/functions/admin-users` (crear, desactivar/reactivar, cambiar contraseña, editar).
- `scripts/crear-contador.mjs` para el primer contador.
- CI `.github/workflows/ci.yml` (no ha corrido: aún no hay repo en GitHub).

Nada de esto se ha probado contra una base real. Puede necesitar ajustes al correrlo.

### Pendiente para cerrar la fase

1. **Docker Desktop** (Diego) → correr Supabase local, pgTAP, generar tipos y probar el login real y el alta de los 5 usuarios.
2. **Repo o ruta de moodra.mx** (Diego) → tokens de diseño definitivos.
3. **GitHub + Netlify** (Diego crea las cuentas y el repo) → CI y deploy de preview.
4. **Proyecto Supabase en la nube** (Diego) → necesario para probar en el celular fuera de casa y para el preview de Netlify.

### Cómo probar hoy en tu celular (solo interfaz, sin entrar)

Compu y celular en el mismo wifi:

1. En `C:\dev\moodra-caja`: `pnpm build` y luego `pnpm preview`.
2. La terminal muestra una dirección "Network", tipo `http://192.168.x.x:4173`. Ábrela en el celular.
3. Verás el login con la identidad de Moodra y la guía de instalación. **No podrás entrar**: todavía no hay backend.
4. Instalar como app y el modo sin señal requieren HTTPS, o sea el deploy de Netlify. En esa dirección local no funcionan.

### Cómo probar completo cuando tengas Docker

1. Abre Docker Desktop y espera a que diga "running".
2. `pnpm db:start` (la primera vez tarda varios minutos).
3. `pnpm db:test` → deben pasar los 27 casos de pgTAP.
4. `pnpm exec supabase status` → copia la URL y la llave pública a `apps/web/.env.local` (plantilla en `apps/web/.env.example`).
5. Crea tu usuario contador (PowerShell):
   - `$env:SUPABASE_URL="http://127.0.0.1:54321"`
   - `$env:SUPABASE_SERVICE_ROLE_KEY="<llave secreta de supabase status>"`
   - `$env:CONTADOR_PASSWORD="<tu contraseña>"`
   - `pnpm crear-contador`
6. En otra terminal: `pnpm functions:serve`.
7. `pnpm dev` → abre `http://localhost:5173`, entra como `diego`.
8. Más → enciende **Modo contador** → **Usuarios** → crea a Pepe, Ram, Uli y al becario (a este último quítale "Participa en repartos").
9. Cierra sesión y entra con uno de ellos: no debe ver el Modo contador.

### Comandos

| Qué               | Comando                        |
| ----------------- | ------------------------------ |
| App en desarrollo | `pnpm dev`                     |
| Lint / tipos      | `pnpm lint` · `pnpm typecheck` |
| Vitest            | `pnpm test`                    |
| Playwright        | `pnpm test:e2e`                |
| pgTAP             | `pnpm db:test`                 |
| Tipos de la BD    | `pnpm db:types`                |
