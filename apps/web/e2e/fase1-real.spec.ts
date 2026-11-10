import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Criterios de aceptación de la Fase 1, contra Supabase local real
// (Auth + RLS + RPC + Realtime). Corre con E2E_REAL=1.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }

let a: Page // integrante
let b: Page // contador

function localSupabase() {
  const out = execSync('pnpm exec supabase status -o env', { cwd: '../..', encoding: 'utf8' })
  const read = (key: string) => new RegExp(`^${key}="?([^"\\r\\n]+)"?`, 'm').exec(out)?.[1]
  return { url: read('API_URL')!, serviceKey: read('SERVICE_ROLE_KEY')! }
}

async function openAs(browser: Browser, user: typeof conta): Promise<Page> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(user.username)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText(`Qué onda, ${user.name}`)).toBeVisible()
  await page.getByRole('button', { name: 'Ahora no' }).click()
  return page
}

async function typeAmount(page: Page, digits: string) {
  const sheet = page.getByRole('dialog')
  for (const digit of digits) await sheet.getByRole('button', { name: digit, exact: true }).click()
  await sheet.getByRole('button', { name: 'Continuar' }).click()
}

const sync = (page: Page) => page.getByRole('status', { name: 'Sincronización' })
const cash = (page: Page) => page.getByTestId('saldo-efectivo')
const pick = (page: Page, name: string | RegExp) =>
  page.getByRole('dialog').getByRole('button', { name }).click()
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name }).click()

test.beforeAll(async ({ browser, request }) => {
  const supabase = localSupabase()
  execSync('node scripts/crear-contador.mjs', {
    cwd: '../..',
    stdio: 'pipe',
    env: {
      ...process.env,
      SUPABASE_URL: supabase.url,
      SUPABASE_SERVICE_ROLE_KEY: supabase.serviceKey,
      CONTADOR_USERNAME: conta.username,
      CONTADOR_NOMBRE: conta.name,
      CONTADOR_PASSWORD: conta.password,
    },
  })
  const headers = { apikey: supabase.serviceKey, Authorization: `Bearer ${supabase.serviceKey}` }
  const created = await request.post(`${supabase.url}/auth/v1/admin/users`, {
    headers,
    data: {
      email: `${inte.username}@caja.moodra.mx`,
      password: inte.password,
      email_confirm: true,
    },
  })
  expect(created.ok(), await created.text()).toBe(true)
  const { id } = (await created.json()) as { id: string }
  await request.patch(`${supabase.url}/rest/v1/profiles?id=eq.${id}`, {
    headers,
    data: { display_name: inte.name },
  })

  a = await openAs(browser, inte)
  b = await openAs(browser, conta)
})

test.afterAll(async () => {
  await a?.context().close()
  await b?.context().close()
})

test('gasto con mi dinero en modo avión: se guarda, se sincroniza una vez y llega al otro celular', async () => {
  await a.context().setOffline(true)

  await a.getByRole('button', { name: 'Gasté' }).click()
  await typeAmount(a, '850')
  await pick(a, /Transporte/)
  await pick(a, /Mi dinero/)
  await pick(a, /Regrésenmelo/)
  await expect(a.getByRole('dialog')).toContainText(
    'Gastaste $850 en ⛽ Transporte, con tu dinero. Te lo regresamos.',
  )
  await pick(a, 'Guardar')

  // Guardado al instante en el celular, sin red.
  await expect(a.getByRole('status', { name: 'Avisos' })).toContainText('Guardado')
  await expect(sync(a)).toContainText('Sin señal · 1 guardado en tu celular')
  await expect(a.getByText(`${inte.name} gastó $850 en Transporte`)).toBeVisible()
  await expect(a.getByText('pendiente de sincronizar')).toBeVisible()
  await expect(a.getByTestId('saldo-por-regresar')).toContainText('$850')
  await expect(b.getByText(`${inte.name} gastó $850 en Transporte`)).toHaveCount(0)

  // Vuelve la señal: se manda solo y aparece en el otro celular sin recargar.
  await a.context().setOffline(false)
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
  await expect(a.getByText('pendiente de sincronizar')).toHaveCount(0)
  await expect(b.getByText(`${inte.name} gastó $850 en Transporte`)).toBeVisible({
    timeout: 15_000,
  })
  await expect(a.getByTestId('saldo-por-regresar')).toContainText('$850')

  // Una sola vez: un único renglón en el historial completo.
  await nav(b, 'Movimientos')
  await expect(b.getByText(`${inte.name} gastó $850 en Transporte`)).toHaveCount(1)
  await nav(b, 'Inicio')
})

test('una entrega de efectivo no mueve saldos hasta que el receptor confirma', async () => {
  // El integrante cobra $500 en efectivo y luego le pasa $200 al contador.
  await a.getByRole('button', { name: 'Cobré' }).click()
  await pick(a, /Patrocinio/)
  await typeAmount(a, '500')
  await pick(a, /Lo traigo yo en efectivo/)
  await pick(a, 'Guardar')
  await expect(cash(a)).toHaveText('$500')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })

  await a.getByRole('button', { name: 'Pasé efectivo' }).click()
  await typeAmount(a, '200')
  await pick(a, new RegExp(conta.name))
  await expect(a.getByRole('dialog')).toContainText(`Le pasaste $200 a ${conta.name}`)
  await pick(a, 'Guardar')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })

  // Pendiente: nadie cambia de saldo todavía.
  const pendiente = b.getByRole('region', { name: 'Pendientes' })
  await expect(pendiente).toContainText(`${inte.name} dice que te pasó $200. ¿Lo recibiste?`, {
    timeout: 15_000,
  })
  await expect(cash(a)).toHaveText('$500')
  await expect(cash(b)).toHaveText('$0')

  // El receptor confirma: ahora sí.
  await pendiente.getByRole('button', { name: /Sí/ }).click()
  await expect(cash(b)).toHaveText('$200', { timeout: 15_000 })
  await expect(cash(a)).toHaveText('$300', { timeout: 15_000 })
  await expect(pendiente).toHaveCount(0)
})

test('"Deshacer" anula el registro y el saldo regresa', async () => {
  await a.getByRole('button', { name: 'Gasté' }).click()
  await typeAmount(a, '100')
  await pick(a, /Comida/)
  await pick(a, /Efectivo de la banda/)
  await pick(a, 'Guardar')
  await expect(cash(a)).toHaveText('$200')
  await a.getByRole('status', { name: 'Avisos' }).getByRole('button', { name: 'Deshacer' }).click()
  await expect(cash(a)).toHaveText('$300', { timeout: 15_000 })
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
})

test('el contador ve el libro diario y la balanza cuadra', async () => {
  await nav(b, 'Más')
  await b.getByRole('switch').click()
  await b.getByRole('link', { name: /Balanza/ }).click()
  await expect(b.getByText('La balanza cuadra ✓')).toBeVisible()
  await expect(b.getByText('Sumas iguales')).toBeVisible()

  await nav(b, 'Más')
  await b.getByRole('link', { name: /Libro diario/ }).click()
  await expect(b.getByText('Gasto: Transporte').first()).toBeVisible()
  await expect(b.getByText('Entrega de efectivo').first()).toBeVisible()
})

test('se crea una gira y cualquiera la pone como contexto', async () => {
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Giras y proyectos/ }).click()
  await b.getByRole('button', { name: 'Nueva gira, show o proyecto' }).click()
  await b.getByRole('dialog').getByRole('button', { name: 'Gira', exact: true }).click()
  await b.getByRole('dialog').getByLabel('Nombre').fill(`Gira ${run}`)
  await b.getByRole('dialog').getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(b.getByText(`Gira ${run}`).first()).toBeVisible()

  await a.reload()
  const chip = a.getByRole('button', { name: 'Cambiar en qué andamos' })
  await chip.click()
  await pick(a, new RegExp(`Gira ${run}`))
  await expect(chip).toContainText(`Gira ${run}`)

  // El gasto en gira dice para qué fue.
  await a.getByRole('button', { name: 'Gasté' }).click()
  await typeAmount(a, '50')
  await pick(a, /Comida/)
  await pick(a, /Cuenta de la banda/)
  await expect(a.getByRole('dialog')).toContainText(`para Gira ${run}`)
  await pick(a, 'Guardar')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })

  // Deja el contexto como estaba para no afectar otras corridas.
  await chip.click()
  await pick(a, /Operación general/)
  await expect(chip).toContainText('Operación general')
})

test('un integrante crea un show al registrar un gasto y se lo asigna', async () => {
  await a.getByRole('button', { name: 'Gasté' }).click()
  await typeAmount(a, '70')
  await pick(a, /Comida/)
  await pick(a, /Cuenta de la banda/)

  const sheet = a.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Cambiar para qué fue' }).click()
  await expect(sheet.getByRole('button', { name: /Ensayos generales/ })).toBeVisible()
  await sheet.getByRole('button', { name: /Nueva gira, show o proyecto/ }).click()
  await sheet.getByLabel('Nombre').fill(`Show ${run}`)
  await sheet.getByRole('button', { name: 'Crear', exact: true }).click()

  await expect(sheet).toContainText(`para Show ${run}`)
  await pick(a, 'Guardar')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })

  // El show nuevo le aparece al otro integrante, y el contexto general no cambió.
  await expect(a.getByRole('button', { name: 'Cambiar en qué andamos' })).toContainText(
    'Operación general',
  )
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Giras y proyectos/ }).click()
  await expect(b.getByText(`Show ${run}`)).toBeVisible({ timeout: 15_000 })
  await expect(b.getByText('Ensayos generales')).toBeVisible()
})
