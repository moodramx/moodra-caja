import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Criterios de la Fase 5 (parte a), contra Supabase local real: los reportes
// cuadran entre sí con cualquier historial, un gasto nuevo mueve el resultado
// justo por su monto, y el Excel y el PDF salen con los mismos números.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }

let a: Page // integrante
let b: Page // contador
let supabase: { url: string; serviceKey: string; anonKey: string }
let inteToken = ''
let categoryId = ''

function localSupabase() {
  const out = execSync('pnpm exec supabase status -o env', { cwd: '../..', encoding: 'utf8' })
  const read = (key: string) => new RegExp(`^${key}="?([^"\\r\\n]+)"?`, 'm').exec(out)?.[1]
  return {
    url: read('API_URL')!,
    serviceKey: read('SERVICE_ROLE_KEY')!,
    anonKey: read('ANON_KEY')!,
  }
}

async function openAs(browser: Browser, user: typeof conta): Promise<Page> {
  const context = await browser.newContext({
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    acceptDownloads: true,
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
const pick = (page: Page, group: string, name: string) =>
  page.getByRole('group', { name: group }).getByRole('button', { name, exact: true }).click()
/** "-$1,234.50" → -123450 (centavos). */
const toCents = (text: string) => {
  const digits = text.replace(/[^0-9.]/g, '')
  const [pesos = '0', cents = ''] = digits.split('.')
  const value = Number(pesos) * 100 + Number(cents.padEnd(2, '0'))
  return /^\s*[-−]/.test(text) ? -value : value
}
const resultOnScreen = async (page: Page) =>
  toCents(
    await page
      .getByLabel('Tablero')
      .locator('div', { hasText: /^Resultado ·/ })
      .locator('p')
      .last()
      .innerText(),
  )

test.beforeAll(async ({ browser, request }) => {
  supabase = localSupabase()
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
  const session = await request.post(`${supabase.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: supabase.anonKey },
    data: { email: `${inte.username}@caja.moodra.mx`, password: inte.password },
  })
  inteToken = ((await session.json()) as { access_token: string }).access_token
  const categories = (await (
    await request.get(
      `${supabase.url}/rest/v1/categories?select=id&kind=eq.gasto&active=eq.true&limit=1`,
      {
        headers,
      },
    )
  ).json()) as { id: string }[]
  categoryId = categories[0]!.id

  a = await openAs(browser, inte)
  b = await openAs(browser, conta)
  await nav(b, 'Más')
  await b.getByRole('switch').click()
})

test.afterAll(async () => {
  await a?.context().close()
  await b?.context().close()
})

test('el contador ve el tablero y los tres reportes cuadran, en el mes y en todo el historial', async () => {
  await nav(b, 'Reportes')
  await expect(b.getByLabel('Tablero')).toContainText('Dinero de la banda')
  for (const period of ['Este mes', 'Todo']) {
    await pick(b, 'Periodo', period)
    await pick(b, 'Reporte', 'Balance')
    await expect(
      b.getByRole('status').filter({ hasText: 'Activo = Pasivo + Fondo ✓' }),
    ).toBeVisible()
    await pick(b, 'Reporte', 'Flujo de efectivo')
    await expect(b.getByRole('status').filter({ hasText: 'El flujo cuadra' })).toBeVisible()
    await pick(b, 'Reporte', 'Balanza')
    await expect(b.getByRole('status').filter({ hasText: 'La balanza cuadra ✓' })).toBeVisible()
  }
})

test('un gasto nuevo baja el resultado del mes justo por su monto, y todo sigue cuadrando', async ({
  request,
}) => {
  await pick(b, 'Periodo', 'Este mes')
  await pick(b, 'Reporte', 'Resultados')
  const before = await resultOnScreen(b)

  const sent = await request.post(`${supabase.url}/rest/v1/rpc/submit_event`, {
    headers: { apikey: supabase.anonKey, Authorization: `Bearer ${inteToken}` },
    data: {
      p_client_id: randomUUID(),
      p_type: 'gasto',
      p_payload: {
        amount_cents: 12345,
        category_id: categoryId,
        paid_with: 'mi_dinero',
        settlement_pref: 'reembolso',
        description: `Prueba ${run}`,
      },
      p_captured_at: new Date().toISOString(),
    },
  })
  expect(sent.ok(), await sent.text()).toBe(true)

  await expect.poll(() => resultOnScreen(b), { timeout: 15_000 }).toBe(before - 12345)
  await pick(b, 'Reporte', 'Balance')
  await expect(b.getByRole('status').filter({ hasText: 'Activo = Pasivo + Fondo ✓' })).toBeVisible()
  await pick(b, 'Reporte', 'Flujo de efectivo')
  await expect(b.getByRole('status').filter({ hasText: 'El flujo cuadra' })).toBeVisible()
})

test('el Excel y el PDF salen con los mismos números que la pantalla', async () => {
  await pick(b, 'Reporte', 'Resultados')
  const onScreen = await resultOnScreen(b)

  const [excel] = await Promise.all([
    b.waitForEvent('download'),
    b.getByRole('button', { name: 'Excel', exact: true }).click(),
  ])
  expect(excel.suggestedFilename()).toMatch(/^moodra-estado-de-resultados-.*\.xlsx$/)
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(await excel.path())
  const sheet = book.worksheets[0]!
  expect(sheet.name).toBe('Estado de resultados')
  let inFile: number | null = null
  sheet.eachRow((row) => {
    if (row.getCell(1).value === 'Resultado')
      inFile = Math.round(Number(row.getCell(2).value) * 100)
  })
  expect(inFile).toBe(onScreen)

  const [pdf] = await Promise.all([
    b.waitForEvent('download'),
    b.getByRole('button', { name: 'PDF', exact: true }).click(),
  ])
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  const bytes = readFileSync(await pdf.path())
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(bytes.length).toBeGreaterThan(1500)

  const [all] = await Promise.all([
    b.waitForEvent('download'),
    b.getByRole('button', { name: 'Descargar todos en Excel' }).click(),
  ])
  const full = new ExcelJS.Workbook()
  await full.xlsx.readFile(await all.path())
  expect(full.worksheets.map((s) => s.name)).toEqual(
    expect.arrayContaining([
      'Estado de resultados',
      'Balance general',
      'Flujo de efectivo',
      'Balanza de comprobación',
    ]),
  )
})

test('el auxiliar de una cuenta muestra el gasto recién capturado', async () => {
  await pick(b, 'Reporte', 'Auxiliar')
  const select = b.getByLabel('Cuenta')
  const option = await select
    .locator('option', { hasText: `Por regresar a ${inte.name}` })
    .getAttribute('value')
  await select.selectOption(option!)
  await expect(b.getByRole('heading', { name: /Auxiliar · .*Por regresar a/ })).toBeVisible()
  await expect(b.getByRole('row', { name: /Saldo final/ })).toContainText('$123.45')
  if (process.env.CAPTURAS) {
    await pick(b, 'Reporte', 'Resultados')
    await b.screenshot({ path: '../../docs/capturas/fase5a-contador.png', fullPage: true })
  }
})

test('el integrante ve un resumen en palabras de todos los días, sin contabilidad', async () => {
  await nav(a, 'Reportes')
  await expect(a.getByText(/Cómo nos fue/)).toBeVisible()
  await expect(a.getByText('Gastamos', { exact: true })).toBeVisible()
  await expect(a.getByText('En qué se fue')).toBeVisible()
  if (process.env.CAPTURAS)
    await a.screenshot({ path: '../../docs/capturas/fase5a-banda.png', fullPage: true })
  const text = await a.locator('main').innerText()
  for (const word of ['Cargo', 'Abono', 'Balanza', 'Pasivo', 'Activo', 'Auxiliar', 'Excel'])
    expect(text).not.toContain(word)

  // Los reportes financieros completos son para todos: los mismos que ve el contador.
  await pick(a, 'Vista', 'Reportes financieros')
  await expect(a.getByLabel('Tablero')).toContainText('Dinero de la banda')
  await pick(a, 'Reporte', 'Balance')
  await expect(a.getByRole('status').filter({ hasText: 'Activo = Pasivo + Fondo ✓' })).toBeVisible()
  await pick(a, 'Reporte', 'Resultados')
  expect(await resultOnScreen(a)).toBe(await resultOnScreen(b))
  await expect(a.getByRole('button', { name: 'Excel', exact: true })).toBeEnabled()

  // Inicio: lo que salió es solo dinero gastado; la merch va en su propio cuadro.
  await nav(a, 'Inicio')
  await expect(a.getByText('Salió', { exact: true })).toBeVisible()
  if (process.env.CAPTURAS)
    await a.screenshot({ path: '../../docs/capturas/fase5a-inicio.png', fullPage: true })
})
