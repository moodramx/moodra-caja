import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Fases 5b y 5c, contra Supabase local real: el contador paga el sueldo del
// becario, reparte y paga un reparto, hace un arqueo, captura un asiento
// manual, cierra y reabre un mes, y edita catálogos.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }
// Código de cuenta único por corrida: 6.5xx.
const code = `6.${500 + (Number.parseInt(run.slice(0, 4), 16) % 400)}`

let b: Page // contador
let supabase: { url: string; serviceKey: string; anonKey: string }

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
const more = async (page: Page, link: RegExp) => {
  await nav(page, 'Más')
  await page.getByRole('link', { name: link }).click()
}
const card = (page: Page, title: string) =>
  page.locator('section').filter({ hasText: title }).first()
const toast = (page: Page) => page.getByRole('status', { name: 'Avisos' })

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

  // El integrante pone dinero en la cuenta (hoy) y hay un gasto del mes pasado,
  // para que exista un mes anterior que cerrar.
  const session = await request.post(`${supabase.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: supabase.anonKey },
    data: { email: `${inte.username}@caja.moodra.mx`, password: inte.password },
  })
  const token = ((await session.json()) as { access_token: string }).access_token
  const categories = (await (
    await request.get(`${supabase.url}/rest/v1/categories?select=id&slug=eq.promo`, { headers })
  ).json()) as { id: string }[]
  const submit = (type: string, payload: object, when: Date) =>
    request.post(`${supabase.url}/rest/v1/rpc/submit_event`, {
      headers: { apikey: supabase.anonKey, Authorization: `Bearer ${token}` },
      data: {
        p_client_id: randomUUID(),
        p_type: type,
        p_payload: payload,
        p_captured_at: when.toISOString(),
      },
    })
  const put = await submit(
    'puse_dinero',
    { amount_cents: 2_000_000, destination: 'cuenta_banda', kind: 'aportacion' },
    new Date(),
  )
  expect(put.ok(), await put.text()).toBe(true)
  const lastMonth = new Date()
  lastMonth.setDate(0) // último día del mes pasado
  const old = await submit(
    'gasto',
    { amount_cents: 10_000, category_id: categories[0]!.id, paid_with: 'cuenta_banda' },
    lastMonth,
  )
  expect(old.ok(), await old.text()).toBe(true)

  b = await openAs(browser, conta)
  await nav(b, 'Más')
  await b.getByRole('switch').click()
})

test.afterAll(async () => {
  await b?.context().close()
})

test('el contador paga el sueldo del becario con un toque', async () => {
  await more(b, /Operación del mes/)
  const becario = card(b, 'Sueldo del becario')
  await becario.getByRole('button', { name: 'Pagar $7,000.00' }).click()
  await expect(toast(b)).toContainText('Sueldo del becario pagado')
  await expect(becario.getByText(/Ya está pagado este mes/)).toBeVisible({ timeout: 15_000 })
})

test('reparte, ve la vista previa y paga un reparto', async () => {
  const repartos = card(b, 'Repartos')
  await repartos.getByLabel('Monto a repartir (pesos)').fill('1000')
  const preview = repartos.getByRole('table', { name: 'Vista previa del reparto' })
  await expect(preview.getByRole('row').filter({ hasText: inte.name })).toBeVisible()
  await expect(preview.getByRole('row').filter({ hasText: conta.name })).toBeVisible()
  await repartos.getByRole('button', { name: 'Repartir', exact: true }).click()
  await expect(toast(b)).toContainText('Reparto registrado')

  const pending = repartos.getByRole('listitem').filter({ hasText: inte.name })
  await expect(pending).toBeVisible({ timeout: 15_000 })
  await pending.getByRole('button', { name: 'Pagar' }).click()
  await expect(toast(b)).toContainText('Pago de reparto registrado')
  await expect(pending).toHaveCount(0, { timeout: 15_000 })
})

test('un arqueo de caja compara lo contado contra los libros', async () => {
  const arqueo = card(b, 'Arqueo de efectivo')
  await arqueo.getByRole('button', { name: 'Caja', exact: true }).click()
  const expected = (await arqueo.getByText(/Según los libros debe haber/).innerText()).match(
    /\$[\d,.]+/,
  )![0]
  await arqueo
    .getByLabel('Cuánto contaste (pesos)')
    .fill(expected.replace(/[$,]/g, '').replace(/\.$/, ''))
  await expect(arqueo.getByRole('status')).toHaveText('Cuadra ✓')
  await arqueo.getByRole('button', { name: 'Registrar arqueo' }).click()
  await expect(toast(b)).toContainText('Arqueo registrado')
})

test('un asiento manual solo entra si cuadra, y aparece en Movimientos', async () => {
  await more(b, /Asiento manual/)
  await b.getByLabel('Motivo').fill(`Comisión banco ${run}`)
  await b.getByLabel('Cuenta del renglón 1').selectOption({ label: '7.4 Comisiones bancarias' })
  await b.getByLabel('Cargo 1').fill('150')
  await b.getByLabel('Cuenta del renglón 2').selectOption({ label: '1.2.01 Cuenta Moodra' })
  await b.getByLabel('Abono 2').fill('140')
  await expect(b.getByRole('status').filter({ hasText: 'No cuadra' })).toBeVisible()
  await expect(b.getByRole('button', { name: 'Registrar asiento' })).toBeDisabled()
  await b.getByLabel('Abono 2').fill('150')
  await expect(b.getByRole('status').filter({ hasText: 'Cuadra ✓ · $150.00' })).toBeVisible()
  await b.getByRole('button', { name: 'Registrar asiento' }).click()
  await nav(b, 'Movimientos')
  await expect(b.getByText(`Ajuste del contador: Comisión banco ${run} · $150`)).toBeVisible({
    timeout: 15_000,
  })
})

test('cierra el mes pasado y lo reabre con motivo; el mes en curso no se cierra', async () => {
  await more(b, /Cierres de mes/)
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  const now = new Date()
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const row = (date: Date) =>
    b
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`${months[date.getMonth()]} ${date.getFullYear()}`) })

  // El mes en curso todavía no se puede cerrar.
  await row(now).getByRole('button').first().click()
  await expect(row(now).getByRole('button', { name: 'Este mes todavía no termina' })).toBeDisabled()
  await row(now).getByRole('button').first().click()

  // El mes pasado: si una corrida anterior lo dejó cerrado, primero se reabre.
  await row(last).getByRole('button').first().click()
  const reopen = async () => {
    await row(last).getByLabel('Motivo para reabrir').fill(`Prueba ${run}`)
    await row(last).getByRole('button', { name: 'Reabrir el mes' }).click()
    await expect(toast(b)).toContainText('Mes reabierto')
    await expect(row(last).getByRole('button', { name: 'Cerrar el mes' })).toBeVisible({
      timeout: 15_000,
    })
  }
  await expect(row(last).getByRole('button', { name: /Cerrar el mes|Reabrir el mes/ })).toBeVisible(
    { timeout: 15_000 },
  )
  if (await row(last).getByRole('button', { name: 'Reabrir el mes' }).isVisible()) await reopen()

  await row(last).getByRole('button', { name: 'Cerrar el mes' }).click()
  await expect(toast(b)).toContainText('Mes cerrado')
  await expect(row(last).getByText(/🔒 cerrado/)).toBeVisible({ timeout: 15_000 })
  // Se deja abierto para no afectar a otras pruebas.
  await reopen()
})

test('edita catálogos: una cuenta nueva y un contacto', async () => {
  await more(b, /Catálogos/)
  await b.getByLabel('Código').fill(code)
  await b.getByLabel('Nombre de la cuenta').fill(`Cuenta ${run}`)
  await b.getByRole('button', { name: 'Agregar cuenta' }).click()
  await expect(
    b.getByRole('button', { name: new RegExp(`${code.replace('.', '\\.')} Cuenta ${run}`) }),
  ).toBeVisible({
    timeout: 15_000,
  })

  await b
    .getByRole('group', { name: 'Catálogo' })
    .getByRole('button', { name: 'Contactos' })
    .click()
  await b.getByLabel('Nombre del contacto').fill(`Foro ${run}`)
  await b.getByLabel('Ciudad').fill('CDMX')
  await b.getByRole('button', { name: 'Agregar contacto' }).click()
  await expect(b.getByText(`Foro ${run}`)).toBeVisible({ timeout: 15_000 })
})

test('Reportes incluye la liquidación de quién le debe a quién', async () => {
  await nav(b, 'Reportes')
  await b
    .getByRole('group', { name: 'Reporte' })
    .getByRole('button', { name: 'Liquidación' })
    .click()
  await expect(b.getByRole('heading', { name: 'Liquidación: quién le debe a quién' })).toBeVisible()
  if (process.env.CAPTURAS) {
    await more(b, /Operación del mes/)
    await b.screenshot({ path: '../../docs/capturas/fase5b-operacion.png', fullPage: true })
  }
})
