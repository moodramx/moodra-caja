# PROGRESO — Moodra $$

## Fase 0 — Cimientos · 2026-11-10 · **lista en local; falta GitHub, Netlify y los tokens de moodra.mx**

### Hecho y verificado en esta compu

- Monorepo pnpm (`apps/web`), Vite 8 + React 19 + TypeScript strict, ESLint y Prettier.
- PWA: manifest, íconos, service worker y guía de instalación para iOS y Android.
- Design system: tokens provisionales, botón, chip, hoja inferior, avisos con "Deshacer" (10 s), teclado de monto y layout móvil con navegación inferior.
- Rutas: Inicio, Movimientos, Merch, Reportes, Más, Modo contador → Usuarios, y `/componentes`.
- Supabase local (Docker): migraciones aplicadas con `profiles`, `app_settings`, `audit_log` y RLS.
- Login real con usuario + contraseña (username → `username@caja.moodra.mx`).
- Edge Function `admin-users`: el contador crea, desactiva, reactiva y cambia contraseñas; un integrante recibe 403 aunque llame a la función directo.
- Tipos de la base generados con `supabase gen types`.

### Pruebas (todas en verde)

| Suite                                 | Resultado |
| ------------------------------------- | --------- |
| pgTAP                                 | 26/26     |
| Vitest                                | 23/23     |
| Playwright con sesión simulada        | 11/11     |
| Playwright real contra Supabase local | 3/3       |
| Lint, typecheck, Prettier             | limpios   |

JS de la ruta de inicio: ~153 KB gzip el archivo principal (límite del PRD: 200 KB en total).

### Lo que NO está hecho

1. **CI en GitHub Actions**: el workflow está escrito pero nunca ha corrido; no hay repo en GitHub.
2. **Deploy de preview en Netlify**: `netlify.toml` está listo, sin cuenta ni sitio.
3. **Instalar la PWA en iPhone y Android**: requiere HTTPS, o sea el deploy. No se ha probado en ningún celular.
4. **Tokens de diseño de moodra.mx**: siguen los provisionales.
5. **Los 5 usuarios reales**: solo se probó con usuarios de prueba locales.

### Qué necesito de Diego

1. Cuenta y repo en **GitHub** (privado) → subo el código y corre el CI.
2. Cuenta en **Netlify** conectada a ese repo → deploy de preview.
3. Un proyecto en **Supabase en la nube** (desarrollo) → para que el preview y tu celular tengan backend.
4. La **ruta o repo de la web moodra.mx** → tokens definitivos.

### Cómo probarlo hoy en la compu

1. Abre Docker Desktop y espera a que diga "Engine running".
2. En `C:\dev\moodra-caja`: `pnpm db:start` (ya no descarga nada; tarda ~1 minuto).
3. Crea tu usuario contador (PowerShell). La llave sale de `pnpm exec supabase status -o env`, renglón `SERVICE_ROLE_KEY`:
   - `$env:SUPABASE_URL="http://127.0.0.1:54321"`
   - `$env:SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"`
   - `$env:CONTADOR_PASSWORD="<tu contraseña, 8+ caracteres>"`
   - `pnpm crear-contador`
4. `pnpm dev` → abre `http://localhost:5173` y entra como `diego`.
5. Más → enciende **Modo contador** → **Usuarios** → crea a Pepe, Ram, Uli y al becario (a este quítale "Participa en repartos").
6. Cierra sesión y entra con uno de ellos: no debe ver el Modo contador.
7. Más → **Probar componentes**: teclado de monto, hoja inferior y aviso con "Deshacer".

`apps/web/.env.local` ya apunta al Supabase local. Para apagar todo: `pnpm db:stop`.

### En el celular

Todavía no se puede probar de verdad. Con `pnpm build` y `pnpm preview` puedes abrir la dirección "Network" desde el celular en el mismo wifi y ver el login, pero no entrar (el backend local solo escucha en la compu) ni instalarla (falta HTTPS). Eso llega con Netlify + Supabase en la nube.

### Comandos

| Qué                     | Comando                            |
| ----------------------- | ---------------------------------- |
| App en desarrollo       | `pnpm dev`                         |
| Supabase local          | `pnpm db:start` · `pnpm db:stop`   |
| Lint / tipos            | `pnpm lint` · `pnpm typecheck`     |
| Vitest                  | `pnpm test`                        |
| Playwright (simulado)   | `pnpm test:e2e`                    |
| Playwright + login real | `$env:E2E_REAL='1'; pnpm test:e2e` |
| pgTAP                   | `pnpm db:test`                     |
| Tipos de la BD          | `pnpm db:types`                    |
| Borrar datos locales    | `pnpm db:reset`                    |
