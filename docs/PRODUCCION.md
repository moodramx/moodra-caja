# Pasar a producción (`caja.moodra.mx`)

Hoy la app corre en el proyecto de **desarrollo** de Supabase y en un sitio de Netlify con nombre provisional y privado. Estos pasos los hace Diego porque piden cuentas, dominio y contraseñas.

## 1. Supabase de producción

1. Crea un proyecto nuevo en Supabase (por ejemplo `moodra-caja-prod`), en la misma región.
2. En una terminal, dentro de `C:\dev\moodra-caja`, enlázalo y aplica las migraciones:

```bash
.\node_modules\.bin\supabase.cmd link --project-ref REF_DE_PRODUCCION
```

```bash
.\node_modules\.bin\supabase.cmd db push
```

3. Sube las funciones:

```bash
.\node_modules\.bin\supabase.cmd functions deploy admin-users
```

```bash
.\node_modules\.bin\supabase.cmd functions deploy route-estimate
```

```bash
.\node_modules\.bin\supabase.cmd functions deploy notify --no-verify-jwt
```

4. Crea al contador con `node scripts/crear-contador.mjs` (pide la URL y la llave secreta de producción en tu terminal).
5. Guarda los secretos: `GOOGLE_MAPS_KEY` (si se usa) y corre `node scripts/generar-vapid.mjs`.
6. Para volver a trabajar con desarrollo, enlaza otra vez el proyecto de desarrollo.

Los datos de prueba del proyecto de desarrollo **no** se copian: producción empieza limpia. Ver "Saldos iniciales" abajo.

## 2. Netlify

1. En el sitio de Netlify → **Site configuration → Environment variables**, pon los valores de producción:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (la llave publicable)
2. Quita la protección del sitio (**Site configuration → Access & security**) para que la banda pueda entrar.
3. Vuelve a desplegar (**Deploys → Trigger deploy**).

## 3. Dominio

1. En Netlify → **Domain management → Add a domain** → `caja.moodra.mx`.
2. En GoDaddy → DNS de `moodra.mx` → agrega un registro **CNAME**: nombre `caja`, valor el nombre del sitio en Netlify (`<sitio>.netlify.app`).
3. Espera a que Netlify emita el certificado (HTTPS). Puede tardar hasta una hora.

## 4. GitHub

Actualiza los secretos de Actions (`SUPABASE_URL`, `CRON_SECRET`, `SUPABASE_DB_URL`) con los de producción. Ver `RESPALDOS.md`.

## 5. Saldos iniciales

Con la app limpia, antes de que la banda empiece:

1. Da de alta a los usuarios.
2. Dinero que ya tiene la banda: cada quien captura **Puse dinero** como aportación, o el contador hace un asiento manual contra Resultados acumulados (3.3).
3. Merch que ya existe: **Entró merch → Saldo inicial**, con piezas y costo.
4. Boleteras, autos y tarifas de transporte.

## 6. Revisión final

- Cada integrante instala la app, entra y activa notificaciones.
- Una captura de prueba por persona, con y sin señal.
- Corre a mano los trabajos **Diario** y **Respaldo semanal** en GitHub Actions y restaura ese respaldo en un proyecto de prueba.

## Lo que falta para dar por cerrada la Fase 6

- Uso real de los 5 usuarios durante un show.
- Un respaldo restaurado con éxito.
- Auditoría de velocidad (Lighthouse móvil ≥ 90): no se ha corrido. La carga inicial pesa alrededor de 190 KB comprimidos, cerca del presupuesto de 200 KB.
- Envío en segundo plano en Android (Background Sync): no está hecho; la app sincroniza al abrirla, al volver la señal y cada 30 segundos mientras está abierta.
