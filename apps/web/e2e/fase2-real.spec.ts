import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Criterios de aceptación de la Fase 2, contra Supabase local real:
// vender 3 playeras (una de regalo) sin señal y que inventario, costo de venta,
// merch regalado y efectivo cuadren al centavo; anular deja todo como estaba.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }
const playera = `Playera ${run}`

let a: Page // integrante (vende)
let b: Page // contador (catálogo)

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

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name }).click()
const sync = (page: Page) => page.getByRole('status', { name: 'Sincronización' })
const cash = (page: Page) => page.getByTestId('saldo-efectivo')
// La tarjeta del producto en la mesa de merch (no los botones del cobro).
const product = (page: Page) => page.locator('main button', { hasText: playera })
/** Renglón de la variante M en el catálogo del contador: "M $350 $costo existencias". */
const catalogRow = (page: Page) =>
  page.locator('section').filter({ hasText: playera }).getByRole('row', { name: /^M / })

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

test('el contador da de alta una playera y registra que entraron 10 a $120', async () => {
  await nav(b, 'Más')
  await b.getByRole('switch').click()
  await b.getByRole('link', { name: /Productos y precios/ }).click()
  await b.getByRole('button', { name: 'Nuevo producto' }).click()
  const form = b.getByRole('dialog')
  await form.getByLabel('Producto').fill(playera)
  await form.getByLabel('Variante 1', { exact: true }).fill('M')
  await form.getByLabel('Precio de la variante 1').fill('350')
  await form.getByLabel(/Avisar cuando queden/).fill('2')
  await form.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(catalogRow(b)).toHaveAccessibleName('M $350 $0 0')

  await nav(b, 'Merch')
  await b.getByRole('button', { name: /Entró merch/ }).click()
  const sheet = b.getByRole('dialog')
  await sheet.getByRole('button', { name: new RegExp(playera) }).click()
  await sheet.getByLabel('Cantidad').fill('10')
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  for (const digit of '120') await sheet.getByRole('button', { name: digit, exact: true }).click()
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  await sheet.getByRole('button', { name: /Cuenta de la banda/ }).click()
  await expect(sheet).toContainText('Entraron 10 piezas')
  await expect(sheet).toContainText('$1,200 en total')
  await sheet.getByRole('button', { name: 'Guardar' }).click()

  await expect(product(b)).toContainText('10 pzas', { timeout: 15_000 })
})

test('vender 3 playeras (una de regalo) sin señal: todo cuadra al centavo', async () => {
  await nav(a, 'Merch')
  await expect(product(a)).toContainText('10 pzas', { timeout: 15_000 })

  await a.context().setOffline(true)

  // Una de regalo…
  await product(a).click()
  await a.getByRole('button', { name: /Cobrar \$350/ }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Regalo' }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  // …y dos vendidas.
  await product(a).click()
  await product(a).click()
  await a.getByRole('button', { name: /3 pzas · Cobrar \$700/ }).click()
  const checkout = a.getByRole('dialog')
  await expect(checkout).toContainText('Vendiste 3 pzas por $700 en efectivo (1 de regalo).')
  await checkout.getByRole('button', { name: 'Cobrar $700' }).click()

  // Sin señal: el stock y el efectivo ya reflejan la venta en este celular.
  await expect(a.getByRole('status', { name: 'Venta registrada' })).toBeVisible()
  await expect(product(a)).toContainText('7 pzas')
  await nav(a, 'Inicio')
  await expect(sync(a)).toContainText('Sin señal · 1 guardado en tu celular')
  await expect(cash(a)).toHaveText('$700')
  await expect(a.getByText(`${inte.name} vendió 3 pzas de merch · $700`)).toBeVisible()

  // Vuelve la señal.
  await a.context().setOffline(false)
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
  await expect(cash(a)).toHaveText('$700')

  // Inventario: 7 piezas a $120. El contador lo ve sin recargar.
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Productos y precios/ }).click()
  await expect(catalogRow(b)).toHaveAccessibleName('M $350 $120 7', { timeout: 15_000 })

  // Diario: efectivo $700, ingreso $700, costo de venta $240 y merch regalado $120.
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Libro diario/ }).click()
  const entry = b.locator('section').filter({ hasText: 'Venta de merch (3 pzas)' }).first()
  await expect(
    entry.getByRole('row', { name: /^1\.1\.\d+ Efectivo en poder de/ }),
  ).toHaveAccessibleName(/\$700\.00$/)
  await expect(entry.getByRole('row', { name: /^4\.2\.01/ })).toHaveAccessibleName(/\$700\.00$/)
  await expect(entry.getByRole('row', { name: /^5\.1 / })).toHaveAccessibleName(/\$240\.00$/)
  await expect(entry.getByRole('row', { name: /^7\.1 / })).toHaveAccessibleName(/\$120\.00$/)
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Balanza/ }).click()
  await expect(b.getByText('La balanza cuadra ✓')).toBeVisible()
})

test('el resumen de la noche muestra lo vendido y lo que queda después del costo', async () => {
  await nav(a, 'Merch')
  const summary = a.locator('section').filter({ hasText: 'Hoy vendimos' })
  await expect(summary).toContainText('$700')
  await expect(summary).toContainText('3 piezas')
  await expect(summary).toContainText('$460') // 700 − 240 de costo
})

test('anular la venta deja todo como estaba', async () => {
  await nav(a, 'Movimientos')
  await a.getByRole('button', { name: new RegExp(`${inte.name} vendió 3 pzas de merch`) }).click()
  const sheet = a.getByRole('dialog')
  await sheet.getByLabel('¿Por qué lo anulas?').fill('Me equivoqué de talla')
  await sheet.getByRole('button', { name: 'Anular este registro' }).click()

  await nav(a, 'Inicio')
  await expect(cash(a)).toHaveText('$0', { timeout: 15_000 })
  await nav(a, 'Merch')
  await expect(product(a)).toContainText('10 pzas', { timeout: 15_000 })

  await nav(b, 'Más')
  await b.getByRole('link', { name: /Productos y precios/ }).click()
  await expect(catalogRow(b)).toHaveAccessibleName('M $350 $120 10', { timeout: 15_000 })
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Balanza/ }).click()
  await expect(b.getByText('La balanza cuadra ✓')).toBeVisible()
})

test('stock bajo y venta sin existencias: avisa pero nunca bloquea', async () => {
  // Quedan 10; se regalan 8 → quedan 2 (umbral de aviso).
  await nav(a, 'Merch')
  await a.getByRole('button', { name: /Regalé/ }).click()
  const sheet = a.getByRole('dialog')
  await sheet.getByRole('button', { name: new RegExp(playera) }).click()
  await sheet.getByLabel('Cantidad').fill('8')
  await expect(sheet).toContainText('Regalaste 8 piezas')
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await expect(product(a)).toContainText('Quedan 2', { timeout: 15_000 })

  // Vende 3 teniendo 2: la venta entra y el stock queda en −1.
  for (let i = 0; i < 3; i++) await product(a).click()
  await a.getByRole('button', { name: /3 pzas · Cobrar \$1,050/ }).click()
  await a.getByRole('dialog').getByRole('button', { name: 'Cobrar $1,050' }).click()
  await expect(product(a)).toContainText('Faltan 1', { timeout: 15_000 })
  await nav(a, 'Inicio')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
  await expect(cash(a)).toHaveText('$1,050')
})
