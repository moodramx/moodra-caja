import { expect, signInAs, test } from './fixtures'

const pepe = { username: 'pepe', display_name: 'Pepe', role: 'integrante', emoji: '🎸' } as const
const diego = { username: 'diego', display_name: 'Diego', role: 'contador', emoji: '🥁' } as const

test.describe('sin sesión', () => {
  test('manda al login y muestra el formulario', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Moodra $$' })).toBeVisible()
    await expect(page.getByLabel('Usuario')).toBeVisible()
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  test('credenciales malas muestran un error humano', async ({ page }) => {
    await page.route('**/auth/v1/token*', (route) =>
      route.fulfill({
        status: 400,
        json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
      }),
    )
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('pepe')
    await page.getByLabel('Contraseña').fill('no-es-esta')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  })

  test('el login ofrece la guía de instalación', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /Instalar en mi celular/ }).click()
    // En Chromium de escritorio/Android sin evento de instalación se muestra la guía manual.
    await expect(page.getByRole('dialog')).toContainText('Ponla en tu pantalla de inicio')
  })
})

test.describe('integrante', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, pepe)
  })

  test('ve el Inicio vacío con la identidad de Moodra', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('img', { name: 'Moodra' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /01 — Inicio/ })).toBeVisible()
    await expect(page.getByText('Qué onda, Pepe')).toBeVisible()
    for (const label of ['Gasté', 'Cobré', 'Vendí merch', 'Pasé efectivo']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }
    const background = await page.evaluate(
      () => getComputedStyle(document.body.parentElement!).backgroundColor,
    )
    expect(background).toBe('rgb(255, 255, 255)')
  })

  test('navega por las seis secciones', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Secciones' })
    for (const [label, heading] of [
      ['Movimientos', /02 — Movimientos/],
      ['Merch', /03 — Merch/],
      ['Transporte', /04 — Transporte/],
      ['Reportes', /05 — Reportes/],
      ['Más', /06 — Más/],
      ['Inicio', /01 — Inicio/],
    ] as const) {
      await nav.getByRole('link', { name: label }).click()
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
  })

  test('las seis pestañas caben sin encimarse en un celular angosto', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/')
    const links = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link')
    await expect(links).toHaveCount(6)
    const list = page.getByRole('navigation', { name: 'Secciones' }).getByRole('list')
    expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    for (const link of await links.all()) {
      const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
      expect(fits, await link.innerText()).toBe(true)
    }
  })

  test('Más ofrece notificaciones y la guía "Cómo se usa" en tres pasos', async ({ page }) => {
    await page.goto('/mas')
    await expect(page.getByText('🔔 Notificaciones')).toBeVisible()
    await page.getByRole('button', { name: /Cómo se usa/ }).click()
    const guide = page.getByRole('dialog')
    await expect(guide.getByText('Registra en el momento')).toBeVisible()
    await guide.getByRole('button', { name: 'Siguiente' }).click()
    await expect(guide.getByText('Funciona sin señal')).toBeVisible()
    await guide.getByRole('button', { name: 'Siguiente' }).click()
    await expect(guide.getByText('Las cuentas, siempre claras')).toBeVisible()
    await guide.getByRole('button', { name: 'Empezar' }).click()
    await expect(guide).toHaveCount(0)
  })

  test('los targets de navegación miden al menos 48 px', async ({ page }) => {
    await page.goto('/')
    const links = page.getByRole('navigation', { name: 'Secciones' }).getByRole('link')
    await expect(links).toHaveCount(6)
    for (const link of await links.all()) {
      const box = await link.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(48)
      expect(box!.width).toBeGreaterThanOrEqual(48)
    }
  })

  test('no ve el Modo contador ni lenguaje contable', async ({ page }) => {
    await page.goto('/mas')
    await expect(page.getByText('@pepe')).toBeVisible()
    await expect(page.getByText('Modo contador')).toHaveCount(0)
    await page.getByRole('button', { name: 'Buscar actualización' }).click()
    await expect(page.getByRole('status', { name: 'Avisos' })).toContainText(
      /última versión|versión nueva/,
    )
    await expect(page.getByText(/versión del \d/)).toBeVisible()
    for (const path of ['/', '/movimientos', '/merch', '/transporte', '/reportes', '/mas']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const text = (await page.locator('body').innerText()).toLowerCase()
      for (const jerga of ['cargo', 'abono', 'póliza', 'asiento', 'debe', 'haber']) {
        expect(text, `"${jerga}" en ${path}`).not.toMatch(new RegExp(`\\b${jerga}\\b`))
      }
    }
  })

  test('teclado de monto en hoja inferior y aviso con Deshacer', async ({ page }) => {
    await page.goto('/componentes')
    await page.getByRole('button', { name: 'Abrir teclado' }).click()
    const sheet = page.getByRole('dialog')
    for (const key of ['8', '5', '0'])
      await sheet.getByRole('button', { name: key, exact: true }).click()
    await expect(sheet.getByLabel('Monto')).toHaveText('$850')
    await sheet.getByRole('button', { name: 'Listo' }).click()
    const avisos = page.getByRole('status', { name: 'Avisos' })
    await expect(avisos).toContainText('Tecleaste $850.00')

    await page.getByRole('button', { name: /Aviso con/ }).click()
    await avisos.getByRole('button', { name: 'Deshacer' }).click()
    await expect(avisos).toContainText('Deshecho.')
  })

  test('no puede abrir la pantalla de usuarios', async ({ page }) => {
    await page.goto('/contador/usuarios')
    await expect(page.getByRole('heading', { name: /01 — Inicio/ })).toBeVisible()
  })
})

test.describe('contador', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, diego)
  })

  test('alterna Modo contador y crea un usuario', async ({ page }) => {
    let body: Record<string, unknown> | null = null
    await page.route('**/functions/v1/admin-users', async (route) => {
      body = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({ json: { user_id: '00000000-0000-4000-8000-000000000002' } })
    })

    await page.goto('/mas')
    await expect(page.getByRole('link', { name: /Usuarios/ })).toHaveCount(0)
    await page.getByRole('switch').click()
    await page.getByRole('link', { name: /Usuarios/ }).click()
    await expect(page.getByRole('heading', { name: /Usuarios/ })).toBeVisible()
    await expect(page.getByText('@diego · contador')).toBeVisible()

    await page.getByRole('button', { name: 'Nuevo usuario' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Nombre').fill('Ram')
    await sheet.getByLabel('Usuario (para entrar)').fill('Ram')
    await sheet.getByLabel(/Contraseña inicial/).fill('bajo-12345')
    await sheet.getByRole('button', { name: 'Crear usuario' }).click()

    await expect(page.getByRole('status', { name: 'Avisos' })).toContainText('Ram ya puede entrar')
    expect(body).toMatchObject({
      action: 'create',
      username: 'ram',
      display_name: 'Ram',
      role: 'integrante',
      participa_reparto: true,
    })
  })
})

test('PWA: manifest e íconos publicados', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const data = (await manifest.json()) as {
    name: string
    display: string
    icons: { src: string }[]
  }
  expect(data.name).toBe('Moodra $$')
  expect(data.display).toBe('standalone')
  for (const icon of data.icons) {
    expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true)
  }
  expect((await request.get('/sw.js')).ok()).toBe(true)
})
