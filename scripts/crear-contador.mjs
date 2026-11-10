// Crea el primer usuario contador (los demás se crean desde la app).
// Uso (PowerShell):
//   $env:SUPABASE_URL="http://127.0.0.1:54321"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY de `pnpm exec supabase status -o env`>"
//   $env:CONTADOR_PASSWORD="<contraseña de 8+ caracteres>"
//   pnpm crear-contador            # usuario "diego" por default
// La contraseña nunca se guarda en el repo.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.CONTADOR_PASSWORD
const username = (process.env.CONTADOR_USERNAME ?? 'diego').toLowerCase()
const displayName = process.env.CONTADOR_NOMBRE ?? 'Diego'

if (!url || !key || !password) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o CONTADOR_PASSWORD.')
  process.exit(1)
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.')
  process.exit(1)
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

// 1. Usuario de Auth. Un trigger crea su perfil como integrante.
const created = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ email: `${username}@caja.moodra.mx`, password, email_confirm: true }),
})
const user = await created.json().catch(() => ({}))
if (!created.ok) {
  console.error(`No se pudo crear (${created.status}):`, user.msg ?? user.message ?? user)
  process.exit(1)
}

// 2. Se asciende a contador.
const promoted = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ role: 'contador', display_name: displayName, emoji: '🥁' }),
})
if (!promoted.ok) {
  console.error(`Usuario creado, pero no se pudo hacer contador (${promoted.status}):`)
  console.error(await promoted.text())
  process.exit(1)
}
console.log(`Listo: contador "${username}" creado (id ${user.id}).`)
