import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

// Flujo real contra Supabase local (Auth + RLS + Edge Function admin-users).
// Solo corre con E2E_REAL=1 y Supabase local arriba (`pnpm db:start`), y con la
// app compilada apuntando a él (apps/web/.env.local). Los usuarios se crean con
// nombre y contraseña aleatorios en cada corrida; nada se guarda en el repo.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 8)
const contador = { username: `conta-${run}`, password: randomUUID(), name: `Conta ${run}` }
const integrante = { username: `inte-${run}`, password: randomUUID(), name: `Inte ${run}` }

function localSupabase(): { url: string; serviceKey: string } {
  const out = execSync('pnpm exec supabase status -o env', { cwd: '../..', encoding: 'utf8' })
  const read = (key: string) => new RegExp(`^${key}="?([^"\\r\\n]+)"?`, 'm').exec(out)?.[1]
  const url = read('API_URL')
  const serviceKey = read('SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new Error('No se pudo leer `supabase status`')
  return { url, serviceKey }
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

test.beforeAll(() => {
  const { url, serviceKey } = localSupabase()
  // Primer contador, con el mismo script que usará Diego.
  execSync('node scripts/crear-contador.mjs', {
    cwd: '../..',
    stdio: 'pipe',
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      CONTADOR_USERNAME: contador.username,
      CONTADOR_NOMBRE: contador.name,
      CONTADOR_PASSWORD: contador.password,
    },
  })
})

test('contraseña incorrecta no entra', async ({ page }) => {
  await login(page, contador.username, 'no-es-esta-123')
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('el contador entra, crea un integrante y lo desactiva y reactiva', async ({ page }) => {
  await login(page, contador.username, contador.password)
  await expect(page.getByText(`Qué onda, ${contador.name}`)).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Más' })
    .click()
  await page.getByRole('switch').click()
  await page.getByRole('link', { name: /Usuarios/ }).click()
  await expect(page.getByText(`@${contador.username} · contador`)).toBeVisible()

  // Alta
  await page.getByRole('button', { name: 'Nuevo usuario' }).click()
  let sheet = page.getByRole('dialog')
  await sheet.getByLabel('Nombre').fill(integrante.name)
  await sheet.getByLabel('Usuario (para entrar)').fill(integrante.username)
  await sheet.getByLabel(/Contraseña inicial/).fill(integrante.password)
  await sheet.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(page.getByRole('status', { name: 'Avisos' })).toContainText('ya puede entrar')
  const row = page.getByRole('button', { name: new RegExp(`@${integrante.username}`) })
  await expect(row).toBeVisible()

  // Duplicado
  await page.getByRole('button', { name: 'Nuevo usuario' }).click()
  sheet = page.getByRole('dialog')
  await sheet.getByLabel('Nombre').fill('Otro')
  await sheet.getByLabel('Usuario (para entrar)').fill(integrante.username)
  await sheet.getByLabel(/Contraseña inicial/).fill(randomUUID())
  await sheet.getByRole('button', { name: 'Crear usuario' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Ese usuario ya existe')
  await sheet.getByRole('button', { name: 'Cerrar' }).click()

  // Baja y reactivación
  await row.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Desactivar usuario' }).click()
  await expect(row).toContainText('desactivado')
  await row.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivar usuario' }).click()
  await expect(row).not.toContainText('desactivado')
})

test('el integrante entra y no puede administrar', async ({ page }) => {
  await login(page, integrante.username, integrante.password)
  await expect(page.getByText(`Qué onda, ${integrante.name}`)).toBeVisible()

  await page.goto('/mas')
  await expect(page.getByText(`@${integrante.username}`)).toBeVisible()
  await expect(page.getByText('Modo contador')).toHaveCount(0)

  // Aunque llame a la función directo con su sesión, el servidor lo rechaza.
  const status = await page.evaluate(async (api) => {
    const session = JSON.parse(localStorage.getItem('moodra-caja-auth') ?? '{}') as {
      access_token?: string
    }
    const response = await fetch(`${api}/functions/v1/admin-users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        username: 'intruso',
        password: 'intruso-12345',
        display_name: 'Intruso',
        role: 'contador',
      }),
    })
    return response.status
  }, localSupabase().url)
  expect(status).toBe(403)

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
