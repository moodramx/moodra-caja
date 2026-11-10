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
/** Lee el resumen "Hoy vendimos": [vendido, piezas, lo que queda] (0 si aún no hay ventas). */
async function readToday(page: Page): Promise<[number, number, number]> {
  const card = page.locator('section').filter({ hasText: 'Hoy vendimos' })
  if ((await card.count()) === 0) return [0, 0, 0]
  const text = (await card.innerText()).replace(/,/g, '')
  const amounts = [...text.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
  return [amounts[0] ?? 0, Number(/(\d+) piezas?/.exec(text)?.[1] ?? 0), amounts[1] ?? 0]
}
let todayBefore: [number, number, number] = [0, 0, 0]

const product = (page: Page) => page.locator('main button', { hasText: playera })
/** Renglón de la variante M en el catálogo del contador: "M $350 $costo existencias". */
const catalogRow = (page: Page, name = playera) =>
  page
    .locator('section')
    .filter({ hasText: name })
    .getByRole('button', { name: /^(M|Única) \$/ })

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
  await sheet.getByRole('button', { name: /Es una compra nueva/ }).click()
  await sheet.getByLabel('Cantidad').fill('10')
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  for (const digit of '120') await sheet.getByRole('button', { name: digit, exact: true }).click()
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  await sheet.getByRole('button', { name: /Cuenta de la banda/ }).click()
  // La cuenta completa antes de guardar.
  await expect(sheet).toContainText('Entran 10 piezas × $120.00')
  await expect(sheet).toContainText('10 piezas · $1,200.00')
  await expect(sheet).toContainText('ahora $120.00')
  await expect(sheet).toContainText('Compra: 10 piezas por $1,200.00')
  await sheet.getByRole('button', { name: 'Guardar' }).click()

  await expect(product(b)).toContainText('10 pzas', { timeout: 15_000 })
})

test('vender 3 playeras (una de regalo) sin señal: todo cuadra al centavo', async () => {
  await nav(a, 'Merch')
  await expect(product(a)).toContainText('10 pzas', { timeout: 15_000 })
  todayBefore = await readToday(a)

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
  // Respecto a antes de la venta: +$700 vendidos, +3 piezas y +$460 después del costo (700 − 240).
  await expect
    .poll(async () => (await readToday(a)).map((value, i) => value - todayBefore[i]!), {
      timeout: 15_000,
    })
    .toEqual([700, 3, 460])
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

test('la calculadora de cambio dice cuánto devolver', async () => {
  await nav(a, 'Merch')
  await product(a).click()
  await a.getByRole('button', { name: /1 pza · Cobrar \$350/ }).click()
  const checkout = a.getByRole('dialog')
  const change = checkout.getByRole('status', { name: 'Cambio' })

  await checkout.getByLabel('¿Con cuánto te pagan?').fill('500')
  await expect(change).toContainText('Dale de cambio')
  await expect(change).toContainText('$150')
  await checkout.getByRole('button', { name: 'Exacto' }).click()
  await expect(change).toContainText('Pago exacto')
  await checkout.getByLabel('¿Con cuánto te pagan?').fill('300')
  await expect(change).toContainText('Todavía faltan')
  await expect(change).toContainText('$50')

  // No era una venta: se vacía el carrito.
  await checkout.getByRole('button', { name: /Quitar una de/ }).click()
  await checkout.getByRole('button', { name: 'Cerrar' }).click()
})

test('cualquier integrante le pone foto a un producto', async () => {
  await nav(a, 'Merch')
  await a.getByRole('button', { name: /Fotos de productos/ }).click()
  const sheet = a.getByRole('dialog')
  // PNG de 2×2 px generado aquí mismo.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=',
    'base64',
  )
  await sheet
    .getByLabel(`Foto de ${playera}`)
    .setInputFiles({ name: 'playera.png', mimeType: 'image/png', buffer: png })
  await expect(
    sheet.locator('li').filter({ hasText: playera }).getByText('Cambiar foto'),
  ).toBeVisible({
    timeout: 15_000,
  })
  await sheet.getByRole('button', { name: 'Cerrar' }).click()
  await expect(a.getByRole('img', { name: `Foto de ${playera}` })).toBeVisible()

  // Al contador le aparece la foto sin recargar.
  await nav(b, 'Merch')
  await expect(b.getByRole('img', { name: `Foto de ${playera}` })).toBeVisible({ timeout: 15_000 })
})

test('saldo inicial: la cuenta es transparente y queda en los movimientos', async () => {
  const gorra = `Gorra ${run}`
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Productos y precios/ }).click()
  await b.getByRole('button', { name: 'Nuevo producto' }).click()
  const form = b.getByRole('dialog')
  await form.getByLabel('Producto').fill(gorra)
  await form.getByLabel('Precio de la variante 1').fill('200')
  await expect(form).toContainText('Las existencias no se escriben aquí')
  await form.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(catalogRow(b, gorra)).toHaveAccessibleName('Única $200 $0 0')

  // Desde la variante: entró merch → ya las teníamos.
  await catalogRow(b, gorra).click()
  const sheet = b.getByRole('dialog')
  await sheet.getByRole('button', { name: /Entró merch/ }).click()
  await sheet.getByRole('button', { name: /Ya las teníamos/ }).click()
  await sheet.getByLabel('Cantidad').fill('5')
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  for (const digit of '100') await sheet.getByRole('button', { name: digit, exact: true }).click()
  await sheet.getByRole('button', { name: 'Continuar' }).click()
  await expect(sheet).toContainText('Había0 piezas · $0.00')
  await expect(sheet).toContainText('Entran 5 piezas × $100.00$500.00')
  await expect(sheet).toContainText('Quedan5 piezas · $500.00')
  await expect(sheet).toContainText('Saldo inicial: 5 piezas por $500.00. No sale dinero')
  await sheet.getByRole('button', { name: 'Guardar' }).click()
  await expect(catalogRow(b, gorra)).toHaveAccessibleName('Única $200 $100 5', { timeout: 15_000 })

  // Dónde se revisa el costo: los movimientos de la variante.
  await catalogRow(b, gorra).click()
  const moves = b.getByRole('dialog').getByRole('region', { name: 'Movimientos' })
  await expect(moves).toContainText('Saldo inicial')
  await expect(moves).toContainText('+5 pzas')
  await expect(moves).toContainText('5 × $100.00 = $500.00')
  await expect(moves).toContainText('Quedan 5 · $500.00')
  await expect(b.getByRole('dialog')).toContainText('Cómo se calcula el costo')

  // Corregir existencias desde ahí: se contaron 4.
  await b
    .getByRole('dialog')
    .getByRole('button', { name: /Corregir existencias/ })
    .click()
  await b.getByRole('dialog').getByLabel('Cantidad').fill('4')
  await expect(b.getByRole('dialog')).toContainText('Faltan 1 pieza')
  await expect(b.getByRole('dialog')).toContainText('−$100.00')
  await b.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(catalogRow(b, gorra)).toHaveAccessibleName('Única $200 $100 4', { timeout: 15_000 })

  // En el diario: inventario contra el fondo, sin salida de dinero.
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Libro diario/ }).click()
  const entry = b.locator('section').filter({ hasText: 'Saldo inicial de merch (5 pzas)' }).first()
  await expect(entry.getByRole('row', { name: /^1\.4\.01/ })).toHaveAccessibleName(/\$500\.00$/)
  await expect(entry.getByRole('row', { name: /^3\.3 / })).toHaveAccessibleName(/\$500\.00$/)
})

test('editar un producto sí guarda: precio y aviso de stock', async () => {
  const gorra = `Gorra ${run}`
  await nav(b, 'Más')
  await b.getByRole('link', { name: /Productos y precios/ }).click()
  await b
    .locator('section')
    .filter({ hasText: gorra })
    .getByRole('button', { name: /Editar nombre y precios/ })
    .click()
  const form = b.getByRole('dialog')
  await expect(form).toContainText('Hay 4 en inventario')
  await form.getByLabel('Precio de la variante 1').fill('250')
  await form.getByLabel(/Avisar cuando queden/).fill('5')
  await form.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(catalogRow(b, gorra)).toHaveAccessibleName('Única $250 $100 4', { timeout: 15_000 })

  // Persistió: al recargar sigue igual, y con 4 piezas y aviso en 5 marca stock bajo.
  await b.reload()
  await expect(catalogRow(b, gorra)).toHaveAccessibleName('Única $250 $100 4')
  await nav(b, 'Merch')
  await expect(b.locator('main button', { hasText: gorra })).toContainText('Quedan 4')
})

test('venta de show: hay que decir de cuál; venta por otro: se anota a qué se refiere', async () => {
  const foro = `Foro ${run}`
  await nav(a, 'Merch')
  await product(a).click()
  await a.getByRole('button', { name: /1 pza · Cobrar \$350/ }).click()
  const checkout = a.getByRole('dialog')
  const charge = checkout.getByRole('button', { name: 'Cobrar $350' })

  // Show: no deja cobrar hasta elegir (o crear) el show.
  await checkout.getByRole('button', { name: 'Show', exact: true }).click()
  const shows = checkout.getByRole('region', { name: 'Show de la venta' })
  await expect(shows).toContainText('Elige el show para poder cobrar.')
  await expect(charge).toBeDisabled()
  await shows.getByRole('button', { name: 'Nuevo show' }).click()
  await shows.getByLabel('Nombre').fill(foro)
  await shows.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(shows.getByRole('button', { name: foro })).toHaveAttribute('aria-pressed', 'true')
  await expect(charge).toBeEnabled()
  await charge.click()
  await expect(a.getByRole('status', { name: 'Venta registrada' })).toBeVisible()

  // La venta quedó en ese show: al ponerlo como contexto, Inicio muestra su resultado.
  await nav(a, 'Inicio')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
  const chip = a.getByRole('button', { name: 'Cambiar en qué andamos' })
  await chip.click()
  await a
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(foro) })
    .click()
  await expect(a.getByText(`En ${foro} vamos`)).toBeVisible({ timeout: 15_000 })
  await chip.click()
  await a
    .getByRole('dialog')
    .getByRole('button', { name: /Operación general/ })
    .click()
  await expect(chip).toContainText('Operación general')

  // Otro: recuadro para escribir a qué se refiere.
  await nav(a, 'Merch')
  await product(a).click()
  await a.getByRole('button', { name: /1 pza · Cobrar \$350/ }).click()
  await checkout.getByRole('button', { name: 'Otro', exact: true }).click()
  await expect(checkout.getByRole('region', { name: 'Show de la venta' })).toHaveCount(0)
  await checkout.getByLabel(/¿A qué se refiere\?/).fill('Mercadito de vinilos')
  await checkout.getByRole('button', { name: 'Cobrar $350' }).click()
  await nav(a, 'Inicio')
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })
  await nav(a, 'Movimientos')
  await a
    .getByRole('button', { name: new RegExp(`${inte.name} vendió 1 pza de merch`) })
    .first()
    .click()
  await expect(a.getByRole('dialog')).toContainText('Mercadito de vinilos')
  await a.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
})

test('contador − / + en cada artículo de la mesa de merch', async () => {
  await nav(a, 'Merch')
  const card = a
    .locator('main div')
    .filter({ has: a.locator('button', { hasText: playera }) })
    .last()
  const plus = card.getByRole('button', { name: `Una más de ${playera}` })
  const minus = card.getByRole('button', { name: `Una menos de ${playera}` })
  const count = card.getByLabel(new RegExp(`de ${playera} en la cuenta`))
  const bar = a.getByRole('button', { name: /Cobrar \$/ })

  await expect(count).toHaveText('0')
  await expect(minus).toBeDisabled()

  await plus.click()
  await plus.click()
  await plus.click()
  await expect(count).toHaveText('3')
  await expect(bar).toHaveText('3 pzas · Cobrar $1,050')

  await minus.click()
  await expect(count).toHaveText('2')
  await expect(bar).toHaveText('2 pzas · Cobrar $700')

  // Tocar la tarjeta también suma, y el cobro refleja la misma cantidad.
  await product(a).click()
  await expect(count).toHaveText('3')
  await bar.click()
  await expect(a.getByRole('dialog')).toContainText('Vendiste 3 pzas por $1,050 en efectivo.')
  await a.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()

  // Bajar a cero vacía la cuenta.
  await minus.click()
  await minus.click()
  await minus.click()
  await expect(count).toHaveText('0')
  await expect(bar).toHaveCount(0)
  await expect(minus).toBeDisabled()
})
