import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Transporte entre integrantes, contra Supabase local real: se da de alta un
// auto, se registra un viaje donde uno pone el auto y otro el tag, cada quien
// ve cuánto debe o le deben, y al pagarse quedan a mano.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }
const auto = `Versa ${run}`
const sala = `Sala ${run}`

let a: Page // integrante: pone el auto
let b: Page // contador: pone el tag

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
const transporte = async (page: Page) => {
  await nav(page, 'Transporte')
  await expect(page.getByText('Cuentas de transporte')).toBeVisible()
}
const sheet = (page: Page) => page.getByRole('dialog')
const chip = (page: Page, group: string, name: string) =>
  sheet(page).getByRole('group', { name: group }).getByRole('button', { name, exact: true })

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

test('cualquiera da de alta el auto de otro integrante', async () => {
  await transporte(b)
  await b.getByRole('button', { name: 'Agregar auto' }).click()
  await sheet(b).getByLabel('Nombre del auto').fill(auto)
  await chip(b, 'Dueño', inte.name).click()
  await chip(b, 'Combustible', 'Magna').click()
  await sheet(b).getByLabel('Rendimiento (km por litro)').fill('12')
  await sheet(b).getByRole('button', { name: 'Guardar auto' }).click()
  await expect(b.getByRole('button', { name: new RegExp(auto) })).toContainText(
    `De ${inte.name} · Magna · 12 km por litro`,
  )
})

test('un viaje a ensayo: uno pone el auto y otro el tag, y la app hace las cuentas', async () => {
  await transporte(a)
  await a.getByRole('button', { name: 'Registrar un viaje a mano' }).click()
  const form = sheet(a)
  await form.getByRole('button', { name: 'Ensayo' }).click()

  const salida = form.getByRole('group', { name: 'Salida' })
  await salida.getByRole('button', { name: 'Otro lugar' }).click()
  await salida.getByLabel('Salida: nombre del lugar').fill(`Casa ${run}`)
  const destino = form.getByRole('group', { name: 'Destino' })
  await destino.getByRole('button', { name: 'Otro lugar' }).click()
  await destino.getByLabel('Destino: nombre del lugar').fill(sala)

  await form.getByRole('button', { name: 'Ida y vuelta' }).click()
  await form.getByLabel('Km por sentido').fill('30')
  await chip(a, 'Autos', auto).click()
  await form.getByLabel(`Casetas de ${auto}`).fill('100')
  await chip(a, `Quién pagó el tag de ${auto}`, conta.name).click()

  // Solo entre los dos de esta prueba (la base local tiene usuarios de otras corridas).
  const sharers = form.getByRole('group', { name: 'Se reparte entre' }).getByRole('button')
  for (const button of await sharers.all()) {
    const name = (await button.innerText()).trim()
    const pressed = (await button.getAttribute('aria-pressed')) === 'true'
    if (pressed !== [inte.name, conta.name].includes(name)) await button.click()
  }

  // 60 km ÷ 12 km/l × $24 = $120 de gasolina + $90 de desgaste + $100 de casetas = $310.
  const cuentas = form.getByLabel('Cuentas del viaje')
  await expect(cuentas).toContainText('$310.00')
  await expect(cuentas).toContainText('gasolina $120.00 + desgaste $90.00 + casetas $100.00')
  // A cada quien le tocan $155: Inte puso $210 (recibe $55) y Conta $100 (pone $55).
  await expect(cuentas.getByRole('listitem').filter({ hasText: inte.name })).toContainText(
    'recibe $55.00',
  )
  await expect(cuentas.getByRole('listitem').filter({ hasText: conta.name })).toContainText(
    'pone $55.00',
  )

  await form.getByRole('button', { name: 'Guardar viaje' }).click()
  await expect(a.getByText('Te deben $55')).toBeVisible({ timeout: 15_000 })
  await expect(a.getByRole('button', { name: new RegExp(`Casa ${run} → ${sala}`) })).toContainText(
    '$310',
  )
})

test('quien debe lo ve, paga y quedan a mano', async () => {
  await transporte(b)
  await expect(b.getByText('Debes $55')).toBeVisible({ timeout: 15_000 })
  const pago = b
    .getByRole('listitem')
    .filter({ hasText: `${conta.name} le paga $55 a ${inte.name}` })
  await pago.getByRole('button', { name: 'Ya se pagó' }).click()
  await expect(b.getByText('Estás a mano')).toBeVisible({ timeout: 15_000 })
  await transporte(a)
  await expect(a.getByText('Estás a mano')).toBeVisible({ timeout: 15_000 })
})

test('el viaje y el pago aparecen en Movimientos', async () => {
  await nav(a, 'Movimientos')
  await expect(a.getByText(`${inte.name} registró un viaje a ${sala} · $310`)).toBeVisible()
  await expect(a.getByText(`${conta.name} le pagó $55 de transporte a ${inte.name}`)).toBeVisible()
  if (process.env.CAPTURAS) {
    await transporte(a)
    await a.screenshot({ path: '../../docs/capturas/transporte.png', fullPage: true })
    await a.getByRole('button', { name: 'Registrar un viaje a mano' }).click()
    await a.screenshot({ path: '../../docs/capturas/transporte-viaje.png' })
  }
})

test('un viaje seguido en el mapa: se inicia, el GPS mide lo recorrido y se guarda', async () => {
  test.setTimeout(120_000)
  const context = a.context()
  // Por si quedó abierta una hoja de la prueba anterior.
  await a.keyboard.press('Escape')
  // El mapa no hace falta para la prueba: sin salir a internet.
  if (!process.env.CAPTURAS) {
    await context.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  }
  await context.grantPermissions(['geolocation'])
  const at = (step: number) => ({ latitude: 19.4 + step * 0.0003, longitude: -99.15, accuracy: 8 })
  await context.setGeolocation(at(0))

  await transporte(a)
  await a.getByRole('button', { name: /Iniciar viaje/ }).click()
  await sheet(a).getByRole('button', { name: 'Ensayo' }).click()
  // El auto de quien inicia ya viene elegido.
  await expect(chip(a, 'Autos', auto)).toHaveAttribute('aria-pressed', 'true')
  // Quiénes van en el auto y de quién es el tag se dicen desde el arranque.
  await chip(a, `Quiénes van en ${auto}`, conta.name).click()
  await chip(a, 'Tag', `El de ${conta.name}`).click()
  await sheet(a).getByRole('button', { name: 'Empezar viaje' }).click()
  await expect(a.getByText('Viaje en curso')).toBeVisible()

  // 24 pasos de ~33 m hacia el norte: unos 800 m.
  for (let step = 1; step <= 24; step++) {
    await context.setGeolocation(at(step))
    await a.waitForTimeout(600)
    // A medio camino suben al segundo piso y luego bajan.
    if (step === 8) await a.getByRole('button', { name: /Entramos a vía de cuota/ }).click()
    if (step === 16) await a.getByRole('button', { name: /Salimos de la vía de cuota/ }).click()
  }
  await expect(a.getByLabel('Kilómetros recorridos')).toContainText(/0\.[78] km/)

  if (process.env.CAPTURAS) {
    await a.waitForTimeout(1500)
    await a.screenshot({ path: '../../docs/capturas/transporte-en-curso.png' })
  }

  // El viaje sigue aunque se cambie de pestaña, y se ve desde cualquier lado.
  await nav(a, 'Inicio')
  await a.getByRole('link', { name: /Viaje en curso/ }).click()
  await a.getByRole('button', { name: /Terminar viaje/ }).click()
  await expect(a.getByText('Viaje terminado')).toBeVisible()

  // Si la app se recarga, el viaje sin guardar sigue ahí.
  await a.reload()
  await expect(a.getByText('Viaje terminado')).toBeVisible()
  await a.getByRole('button', { name: 'Revisar y guardar' }).click()
  const form = sheet(a)
  await expect(form.getByText(/El GPS midió 0\.[78] km/)).toBeVisible()
  const salida = form.getByRole('group', { name: 'Salida' })
  await salida.getByRole('button', { name: 'Otro lugar' }).click()
  await salida.getByLabel('Salida: nombre del lugar').fill(sala)
  const destino = form.getByRole('group', { name: 'Destino' })
  await destino.getByRole('button', { name: 'Otro lugar' }).click()
  await destino.getByLabel('Destino: nombre del lugar').fill(`Foro ${run}`)

  const sharers = form.getByRole('group', { name: 'Se reparte entre' }).getByRole('button')
  for (const button of await sharers.all()) {
    const name = (await button.innerText()).trim()
    const pressed = (await button.getAttribute('aria-pressed')) === 'true'
    if (pressed !== [inte.name, conta.name].includes(name)) await button.click()
  }
  // El tramo marcado en el camino llega al resumen; falta decir dónde fue y cuánto cobró.
  const tramo = form.getByRole('group', { name: 'Tramo con tag 1' })
  await expect(tramo).toContainText(/0\.[23] km marcados/)
  await tramo.getByLabel('Tramo 1: dónde entraron').fill('San Antonio')
  await tramo.getByLabel('Tramo 1: dónde salieron').fill('San Jerónimo')
  await tramo.getByLabel('Tramo 1: cobro del tag').fill('95')
  await expect(chip(a, 'De quién es el tag', conta.name)).toHaveAttribute('aria-pressed', 'true')
  await expect(chip(a, `Quiénes iban en ${auto}`, conta.name)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(form.getByLabel('Cuentas del viaje')).toContainText('casetas $95.00')
  if (process.env.CAPTURAS) {
    await a.screenshot({ path: '../../docs/capturas/transporte-gps-resumen.png' })
  }
  await form.getByRole('button', { name: 'Guardar viaje' }).click()

  const row = a.getByRole('button', { name: new RegExp(`${sala} → Foro ${run}`) })
  await expect(row).toContainText('medido por GPS', { timeout: 15_000 })
  await expect(a.getByText('Viaje terminado')).toBeHidden()
  await row.click()
  await expect(a.getByRole('img', { name: 'Mapa del viaje' })).toBeVisible()
  await expect(a.getByText('Tag: San Antonio → San Jerónimo · $95.00')).toBeVisible()
  await expect(a.getByText(`las pagó ${conta.name}`)).toBeVisible()
  if (process.env.CAPTURAS) {
    await a.screenshot({ path: '../../docs/capturas/transporte-gps.png', fullPage: true })
  }
})
