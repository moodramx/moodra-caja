import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

// Criterios de aceptación de la Fase 3, contra Supabase local real: una gira con
// 3 shows de tratos distintos, cerrarlos, ver el resultado consolidado (con
// merch) y saldar lo que debe la boletera al registrar su liquidación.
test.skip(process.env.E2E_REAL !== '1', 'Requiere Supabase local: corre con E2E_REAL=1')
test.describe.configure({ mode: 'serial' })

const run = randomUUID().slice(0, 6)
const conta = { username: `conta-${run}`, password: randomUUID(), name: `Conta${run}` }
const inte = { username: `inte-${run}`, password: randomUUID(), name: `Inte${run}` }
const gira = `Gira ${run}`
const showA = `Fijo ${run}`
const showB = `Taquilla ${run}`
const showC = `Boletos ${run}`
const playera = `Playera ${run}`

let a: Page // integrante
let b: Page // contador
let supabase: { url: string; serviceKey: string }
// Lo que ya se debía antes de esta corrida (la base local guarda corridas anteriores).
const owedBefore = { passline: 0, venues: 0 }
const pesos = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(cents / 100)
    .replace(/\.00$/, '')

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
const more = async (page: Page, link: RegExp) => {
  await nav(page, 'Más')
  await page.getByRole('link', { name: link }).click()
}
const sync = (page: Page) => page.getByRole('status', { name: 'Sincronización' })
const sheet = (page: Page) => page.getByRole('dialog')
const keypad = async (page: Page, digits: string) => {
  for (const digit of digits)
    await sheet(page).getByRole('button', { name: digit, exact: true }).click()
}
const synced = async (page: Page) => {
  await nav(page, 'Inicio')
  await expect(sync(page)).toContainText('Todo al día', { timeout: 15_000 })
}

async function newShow(
  page: Page,
  name: string,
  fill: (form: ReturnType<typeof sheet>) => Promise<void>,
) {
  await more(page, /^🎸 Shows/)
  await page.getByRole('button', { name: 'Nuevo show' }).click()
  const form = sheet(page)
  await form.getByLabel('Nombre del show o lugar').fill(name)
  await form.getByRole('button', { name: gira }).click()
  await fill(form)
  await form.getByRole('button', { name: 'Guardar show' }).click()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible({
    timeout: 15_000,
  })
}

async function openShow(page: Page, name: string) {
  await more(page, /^🎸 Shows/)
  await page.getByRole('button', { name: new RegExp(name) }).click()
}

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
  const owed = (await (
    await request.get(`${supabase.url}/rest/v1/v_receivables?select=name,balance_cents`, {
      headers,
    })
  ).json()) as { name: string; balance_cents: number }[]
  owedBefore.passline = owed.find((row) => row.name === 'Por cobrar a Passline')?.balance_cents ?? 0
  owedBefore.venues = owed.find((row) => row.name === 'Venues')?.balance_cents ?? 0

  a = await openAs(browser, inte)
  b = await openAs(browser, conta)
})

test.afterAll(async () => {
  await a?.context().close()
  await b?.context().close()
})

test('el contador configura la boletera y crea la gira', async () => {
  await nav(b, 'Más')
  await b.getByRole('switch').click()
  await b.getByRole('link', { name: /Boleteras/ }).click()
  await b.getByRole('button', { name: /^Passline/ }).click()
  const form = sheet(b)
  await form.getByLabel('Comisión %').fill('10')
  await form.getByLabel('$ por boleto').fill('5')
  await form.getByLabel('Días a liquidar').fill('7')
  await form.getByRole('button', { name: /La banda/ }).click()
  await form.getByRole('button', { name: 'Guardar' }).click()
  await expect(b.getByRole('button', { name: /^Passline/ })).toContainText(
    '10 % + $5 por boleto · la paga la banda',
  )

  await more(b, /Giras y proyectos/)
  await b.getByRole('button', { name: 'Nueva gira, show o proyecto' }).click()
  await sheet(b).getByLabel('Nombre').fill(gira)
  await sheet(b).getByRole('button', { name: 'Gira', exact: true }).click()
  await sheet(b).getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(b.getByText(gira).first()).toBeVisible()
})

test('un integrante da de alta tres shows de la gira con tratos distintos', async () => {
  await newShow(a, showA, async (form) => {
    await form.getByRole('button', { name: 'Pago fijo', exact: true }).click()
    await form.getByLabel('Pago fijo ($)').fill('8000')
  })
  await newShow(a, showB, async (form) => {
    await form.getByRole('button', { name: '% de taquilla' }).click()
    await form.getByLabel('Nuestro porcentaje (%)').fill('70')
    await form.getByLabel('Precio del boleto ($)').fill('200')
    await form.getByLabel('Boletos que esperamos').fill('100')
  })
  await newShow(a, showC, async (form) => {
    await form.getByRole('button', { name: 'Boletos nuestros' }).click()
    await form.getByLabel('Precio del boleto ($)').fill('250')
    await form.getByLabel('Boletos que esperamos').fill('80')
    await form.getByRole('button', { name: 'Passline' }).click()
  })

  // Lo esperado según el trato: $8,000 · 100×$200×70 % · 80×$250 menos comisión.
  await a.getByRole('button', { name: new RegExp(showB) }).click()
  await expect(sheet(a)).toContainText('70 % de la taquilla')
  await expect(sheet(a)).toContainText('Esperamos $14,000')
  await sheet(a).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await a.getByRole('button', { name: new RegExp(showC) }).click()
  await expect(sheet(a)).toContainText('Esperamos $17,600')
  await sheet(a).getByRole('button', { name: 'Cerrar', exact: true }).click()

  // Como son de hoy, Inicio avisa que falta cerrarlos.
  await nav(a, 'Inicio')
  await expect(a.getByRole('region', { name: 'Shows por cerrar' })).toContainText('Falta cerrar')
})

test('un gasto capturado con el show como contexto queda en ese show', async () => {
  await nav(a, 'Inicio')
  const chip = a.getByRole('button', { name: 'Cambiar en qué andamos' })
  await chip.click()
  await sheet(a)
    .getByRole('button', { name: new RegExp(showA) })
    .click()
  await expect(chip).toContainText(showA)

  await a.getByRole('button', { name: 'Gasté' }).click()
  await keypad(a, '500')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Transporte/ })
    .click()
  await sheet(a)
    .getByRole('button', { name: /Cuenta de la banda/ })
    .click()
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await expect(sync(a)).toContainText('Todo al día', { timeout: 15_000 })

  await chip.click()
  await sheet(a)
    .getByRole('button', { name: /Operación general/ })
    .click()
  await expect(chip).toContainText('Operación general')
})

test('se cierran los tres shows, cada uno según su trato', async () => {
  // Pago fijo, cobrado en efectivo.
  await openShow(a, showA)
  await sheet(a)
    .getByRole('button', { name: /Cerrar show/ })
    .click()
  await expect(sheet(a).getByLabel('Monto')).toHaveText('$8,000')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Lo traigo yo en efectivo/ })
    .click()
  await expect(sheet(a)).toContainText(`Cerraste ${showA}: $8,000. Lo traigo yo en efectivo.`)
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await synced(a)
  await expect(a.getByTestId('saldo-efectivo')).toHaveText('$8,000')

  // % de taquilla: $15,000 de puerta, les toca el 70 %; queda por cobrar.
  await openShow(a, showB)
  await sheet(a)
    .getByRole('button', { name: /Cerrar show/ })
    .click()
  await keypad(a, '15000')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await expect(sheet(a).getByLabel('Monto')).toHaveText('$10,500')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Todavía no nos pagan/ })
    .click()
  await expect(sheet(a)).toContainText(`Cerraste ${showB}: $10,500. Queda pendiente de cobro.`)
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await synced(a)

  // Boletos propios por Passline: 60 boletos, comisión a cargo de la banda.
  await openShow(a, showC)
  await sheet(a)
    .getByRole('button', { name: /Cerrar show/ })
    .click()
  await sheet(a).getByLabel('Boletos vendidos').fill('60')
  await expect(sheet(a).getByLabel('Total vendido ($)')).toHaveValue('15000')
  await expect(sheet(a)).toContainText('Passline se queda $1,800 de comisión. Nos debe $13,200.')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await expect(sheet(a)).toContainText(
    `Cerraste ${showC}: $15,000 (menos $1,800 de comisión). Queda por cobrar a Passline.`,
  )
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await synced(a)
  // Ya no avisa de ninguno de los tres.
  for (const name of [showA, showB, showC]) {
    await expect(a.getByRole('region', { name: 'Shows por cerrar' }).getByText(name)).toHaveCount(0)
  }
})

test('merch vendido en un show y resultado del show en pantalla', async () => {
  // Catálogo y existencias por API con la sesión del contador (ya cubierto por la Fase 2).
  const session = await b.evaluate(
    () => JSON.parse(localStorage.getItem('moodra-caja-auth')!) as { access_token: string },
  )
  const headers = { apikey: supabase.serviceKey, Authorization: `Bearer ${session.access_token}` }
  const rpc = async (fn: string, data: object) => {
    const response = await b.request.post(`${supabase.url}/rest/v1/rpc/${fn}`, { headers, data })
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  const productId = (await rpc('save_product', {
    p_payload: {
      name: playera,
      category: 'playeras',
      variants: [{ label: 'Única', price_cents: 35000 }],
    },
  })) as string
  const [{ variant_id }] = (await (
    await b.request.get(
      `${supabase.url}/rest/v1/v_inventory?select=variant_id&product_id=eq.${productId}`,
      { headers },
    )
  ).json()) as { variant_id: string }[]
  await rpc('submit_event', {
    p_client_id: randomUUID(),
    p_type: 'compra_merch',
    p_captured_at: new Date().toISOString(),
    p_payload: { opening: true, lines: [{ variant_id, qty: 10, unit_cost_cents: 10000 }] },
  })

  await nav(a, 'Merch')
  const plus = a.getByRole('button', { name: `Una más de ${playera}` })
  await plus.click()
  await plus.click()
  await a.getByRole('button', { name: /2 pzas · Cobrar \$700/ }).click()
  await sheet(a).getByRole('button', { name: 'Show', exact: true }).click()
  await sheet(a)
    .getByRole('region', { name: 'Show de la venta' })
    .getByRole('button', { name: showA })
    .click()
  await sheet(a).getByRole('button', { name: 'Cobrar $700' }).click()
  await synced(a)

  // Fijo $8,000 + merch $700 − costo del merch $200 − gasolina $500 = +$8,000.
  await openShow(a, showA)
  const result = sheet(a).getByRole('region', { name: 'Resultado del show' })
  await expect(result).toContainText('Este show dejó')
  await expect(result).toContainText('+$8,000')
  await expect(result).toContainText('Nos pagaron$8,000')
  await expect(result).toContainText('Merch vendido$700')
  await expect(result).toContainText('Costo del merch−$200')
  await expect(result).toContainText('Gastos del show−$500')
  await sheet(a).getByRole('button', { name: 'Cerrar', exact: true }).click()
})

test('la gira muestra su resultado consolidado, incluido el merch', async () => {
  // Shows 8,000 + 10,500 + 15,000 y merch 700 = 34,200;
  // menos gasolina 500, comisión 1,800 y costo del merch 200 = +$31,700.
  await more(a, /Giras y proyectos/)
  await expect(a.getByLabel(`Resultado de ${gira}`)).toHaveText('+$31,700', { timeout: 15_000 })

  await nav(a, 'Inicio')
  const chip = a.getByRole('button', { name: 'Cambiar en qué andamos' })
  await chip.click()
  await sheet(a)
    .getByRole('button', { name: new RegExp(`^.*${gira}`) })
    .first()
    .click()
  await expect(a.getByText(`En ${gira} vamos`)).toBeVisible({ timeout: 15_000 })
  await expect(a.locator('section').filter({ hasText: `En ${gira} vamos` })).toContainText(
    '+$31,700',
  )
  await chip.click()
  await sheet(a)
    .getByRole('button', { name: /Operación general/ })
    .click()
})

test('lo que debe la boletera se salda al registrar su liquidación', async () => {
  // El integrante ve lo que se debe, pero la liquidación de la boletera es del contador.
  const passlineOwed = pesos(owedBefore.passline + 1_320_000)
  const venuesOwed = pesos(owedBefore.venues + 1_050_000)
  await more(a, /Saldos de la banda/)
  const owedA = a.locator('section').filter({ hasText: 'Nos deben' })
  await expect(owedA.getByRole('listitem').filter({ hasText: 'Passline' })).toContainText(
    passlineOwed,
  )
  await expect(
    owedA.getByRole('listitem').filter({ hasText: 'Passline' }).getByRole('button'),
  ).toHaveCount(0)
  await expect(owedA.getByRole('listitem').filter({ hasText: 'Venues' })).toContainText(venuesOwed)

  await more(b, /Saldos de la banda/)
  const owed = b.locator('section').filter({ hasText: 'Nos deben' })
  const passline = owed.getByRole('listitem').filter({ hasText: 'Passline' })
  await expect(passline).toContainText(`${passlineOwed} · suele liquidar en 7 días`)
  await passline.getByRole('button', { name: 'Ya llegó' }).click()
  await expect(sheet(b).getByLabel('Monto')).toHaveText(passlineOwed)
  await sheet(b).getByRole('button', { name: 'Continuar' }).click()
  await sheet(b)
    .getByRole('button', { name: /Llegó a la cuenta de la banda/ })
    .click()
  await expect(sheet(b)).toContainText(
    `Llegaron ${passlineOwed} de Passline. Ya no nos deben nada de ahí.`,
  )
  await sheet(b).getByRole('button', { name: 'Guardar' }).click()
  await expect(passline).toHaveCount(0, { timeout: 15_000 })

  // El integrante registra el pago del venue.
  await owedA
    .getByRole('listitem')
    .filter({ hasText: 'Venues' })
    .getByRole('button', { name: 'Ya llegó' })
    .click()
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Llegó a la cuenta de la banda/ })
    .click()
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await expect(owedA.getByRole('listitem').filter({ hasText: 'Venues' })).toHaveCount(0, {
    timeout: 15_000,
  })

  await more(b, /Balanza/)
  await expect(b.getByText('La balanza cuadra ✓')).toBeVisible()
})

test('un anticipo se descuenta solo al cerrar el show', async () => {
  const suelto = `Suelto ${run}`
  await more(a, /^🎸 Shows/)
  await a.getByRole('button', { name: 'Nuevo show' }).click()
  await sheet(a).getByLabel('Nombre del show o lugar').fill(suelto)
  await sheet(a).getByRole('button', { name: 'Pago fijo', exact: true }).click()
  await sheet(a).getByLabel('Pago fijo ($)').fill('5000')
  await sheet(a).getByRole('button', { name: 'Guardar show' }).click()

  await a.getByRole('button', { name: new RegExp(suelto) }).click()
  await sheet(a).getByRole('button', { name: 'Recibimos anticipo' }).click()
  await keypad(a, '2000')
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Llegó a la cuenta de la banda/ })
    .click()
  await expect(sheet(a)).toContainText(`Recibieron $2,000 de anticipo por ${suelto}`)
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await synced(a)
  const before = await a.getByTestId('saldo-efectivo').innerText()

  await openShow(a, suelto)
  await sheet(a)
    .getByRole('button', { name: /Cerrar show/ })
    .click()
  await sheet(a).getByRole('button', { name: 'Continuar' }).click()
  await sheet(a)
    .getByRole('button', { name: /Lo traigo yo en efectivo/ })
    .click()
  await sheet(a).getByRole('button', { name: 'Guardar' }).click()
  await synced(a)

  // Les pagaron $5,000, pero $2,000 ya habían llegado: en efectivo solo entran $3,000.
  const toNumber = (text: string) => Number(text.replace(/[$,]/g, ''))
  await expect
    .poll(async () => toNumber(await a.getByTestId('saldo-efectivo').innerText()), {
      timeout: 15_000,
    })
    .toBe(toNumber(before) + 3000)
  await openShow(a, suelto)
  await expect(sheet(a).getByRole('region', { name: 'Resultado del show' })).toContainText(
    '+$5,000',
  )
})
