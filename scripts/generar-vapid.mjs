// Genera las llaves de las notificaciones push (VAPID) y el secreto del cron,
// y los guarda en los secrets de Supabase. Se corre UNA vez por proyecto, en tu
// terminal (las llaves privadas nunca se pegan en un chat ni se suben al repo):
//
//   node scripts/generar-vapid.mjs
//
// Al terminar imprime el CRON_SECRET: cópialo a GitHub → Settings → Secrets and
// variables → Actions, junto con SUPABASE_URL (ver docs/RESPALDOS.md).
import { spawnSync } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

const base64url = (buffer) => buffer.toString('base64url')

// Par de llaves P-256, en el formato que usa Web Push.
const ecdh = createECDH('prime256v1')
ecdh.generateKeys()
const publicKey = base64url(ecdh.getPublicKey())
const privateKey = base64url(ecdh.getPrivateKey())
const cronSecret = base64url(randomBytes(32))
const subject = process.env.VAPID_SUBJECT ?? 'mailto:hola@moodra.mx'

const cli =
  process.platform === 'win32' ? 'node_modules\\.bin\\supabase.cmd' : 'node_modules/.bin/supabase'
if (!existsSync(cli)) {
  console.error(
    'No encontré la herramienta de Supabase. Corre este script desde la carpeta del proyecto.',
  )
  process.exit(1)
}

console.log('Guardando las llaves en Supabase (te va a pedir confirmación)…\n')
const result = spawnSync(
  cli,
  [
    'secrets',
    'set',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    `VAPID_SUBJECT=${subject}`,
    `CRON_SECRET=${cronSecret}`,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
if (result.status !== 0) {
  console.error('\nNo se guardaron las llaves. No se imprimió nada: vuelve a correr el script.')
  process.exit(result.status ?? 1)
}

console.log('\nListo. Las notificaciones ya se pueden activar desde Más → Notificaciones.')
console.log('\nPara los avisos de cada noche, agrega estos dos secretos en GitHub:')
console.log('  SUPABASE_URL = https://<tu-proyecto>.supabase.co')
console.log(`  CRON_SECRET  = ${cronSecret}`)
console.log('\n(Si vuelves a correr este script se generan llaves nuevas y todos tienen que')
console.log(' activar las notificaciones otra vez.)')
