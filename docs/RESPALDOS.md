# Respaldos, avisos diarios y notificaciones

Tres cosas corren fuera de la app. Las tres necesitan que **Diego** guarde unos secretos una sola vez. Ninguna llave se pega en un chat ni se sube al repositorio.

## 1. Notificaciones push

En una terminal, dentro de `C:\dev\moodra-caja`:

```bash
node scripts/generar-vapid.mjs
```

Genera las llaves y las guarda en Supabase (pide confirmación). Al final imprime el `CRON_SECRET`: se usa en el paso 2. Después, cada quien activa las notificaciones en **Más → Notificaciones**.

Si se vuelve a correr, se generan llaves nuevas y todos tienen que activarlas otra vez.

## 2. Avisos de cada noche y keep-alive (`.github/workflows/diario.yml`)

Cada noche a las 21:30 manda los avisos del día (shows sin cerrar, resumen de gira, efectivo alto, entregas viejas). De paso mantiene despierta la base, que en el plan gratis de Supabase se pausa tras 7 días sin actividad.

En GitHub → repositorio → **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto        | Valor                               |
| -------------- | ----------------------------------- |
| `SUPABASE_URL` | `https://<proyecto>.supabase.co`    |
| `CRON_SECRET`  | el que imprimió `generar-vapid.mjs` |

El keep-alive funciona aunque no pongas ningún secreto; sin `CRON_SECRET` el trabajo solo deja una advertencia y no manda avisos. `SUPABASE_URL` es opcional mientras se use el proyecto de desarrollo.

Para probarlo: pestaña **Actions → Diario → Run workflow**.

## 3. Respaldo semanal (`.github/workflows/respaldo.yml`)

Cada domingo sube a Google Drive un archivo `moodra-AAAA-MM-DD.tar.gz` con:

- `base.dump`: respaldo completo (`pg_dump`, formato custom).
- `diario.csv`, `balanza.csv`, `saldos.csv`, `inventario.csv`: se abren en Excel sin restaurar nada.

Se conservan 12 semanas. En el plan gratis de Supabase este es el único respaldo descargable. **Mientras no pongas sus secretos, este trabajo falla cada domingo y GitHub te manda un correo: es a propósito, para que no se quede sin respaldo en silencio.**

Secretos en GitHub:

| Secreto           | Cómo se obtiene                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler**, con la contraseña |
| `RCLONE_CONFIG`   | El contenido de `rclone.conf` con un remoto llamado `drive` (abajo)                                |
| `RCLONE_FOLDER`   | Nombre de la carpeta en Drive. Si falta, usa `Respaldos-Moodra`                                    |

### Crear `rclone.conf`

1. Instala rclone en tu compu (rclone.org) y corre `rclone config`.
2. Nuevo remoto, nombre **`drive`**, tipo **Google Drive**, alcance "drive.file", y sigue el inicio de sesión de Google.
3. `rclone config file` dice dónde quedó el archivo. Copia **todo su contenido** al secreto `RCLONE_CONFIG`.

La opción con cuenta de servicio también sirve; lo que importa es que el remoto se llame `drive`.

## Restaurar un respaldo

Hazlo siempre primero en un **proyecto de prueba**, nunca directo sobre el bueno.

1. Crea un proyecto nuevo en Supabase y copia su cadena de conexión (Session pooler).
2. Baja el `.tar.gz` de Drive y descomprímelo.
3. Restaura:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists -d "CADENA_DE_CONEXION" base.dump
```

4. Revisa que cuadre:

```bash
psql "CADENA_DE_CONEXION" -c "select sum(debit_cents) = sum(credit_cents) as cuadra, count(*) from public.journal_lines"
```

5. Apunta una copia de la app a ese proyecto (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) y entra con un usuario.

Hay que usar `pg_restore` de la misma versión mayor que la base (Postgres 17).

## Estado

Los tres trabajos están escritos pero **no se han corrido con secretos reales**. El criterio de la Fase 6 pide al menos un respaldo restaurado con éxito en un proyecto de prueba: sigue pendiente.
