// Crea el primer usuario contador (los demás se crean desde la app).
// Uso (PowerShell):
//   $env:SUPABASE_URL="http://127.0.0.1:54321"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service role / secret key de `supabase status`>"
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

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `${username}@caja.moodra.mx`,
    password,
    email_confirm: true,
    app_metadata: {
      username,
      display_name: displayName,
      role: 'contador',
      participa_reparto: true,
      emoji: '🥁',
    },
  }),
})

const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`No se pudo crear (${res.status}):`, body.msg ?? body.message ?? body)
  process.exit(1)
}
console.log(`Listo: contador "${username}" creado (id ${body.id}).`)
