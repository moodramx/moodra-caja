import { test as base, expect, type Page } from '@playwright/test'

// Sesión simulada: estas pruebas cubren la app (shell, navegación, design
// system) sin depender de Supabase. El login real contra Supabase local se
// prueba en login-real.spec.ts cuando hay backend disponible.
const USER_ID = '00000000-0000-4000-8000-000000000001'

export interface FakeProfile {
  username: string
  display_name: string
  role: 'integrante' | 'contador'
  emoji: string
}

function profileRow(profile: FakeProfile) {
  return {
    id: USER_ID,
    color: '#ffffff',
    participa_reparto: true,
    activo: true,
    created_at: '2026-11-09T00:00:00Z',
    created_by: null,
    ...profile,
  }
}

export async function signInAs(page: Page, profile: FakeProfile) {
  const row = profileRow(profile)
  const session = {
    access_token: 'e2e.fake.token',
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${profile.username}@caja.moodra.mx`,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-09T00:00:00Z',
    },
  }

  await page.addInitScript(
    ([s, p]) => {
      localStorage.setItem('moodra-caja-auth', s as string)
      localStorage.setItem('moodra-caja-profile', p as string)
    },
    [JSON.stringify(session), JSON.stringify(row)],
  )

  await page.route('**/rest/v1/profiles*', (route) => {
    const single = route.request().headers()['accept']?.includes('vnd.pgrst.object')
    return route.fulfill({ json: single ? row : [row] })
  })
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: session }))
}

export const test = base.extend({
  // El service worker se bloquea para poder interceptar la red en las pruebas.
  context: async ({ browser, contextOptions }, use) => {
    const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' })
    await use(context)
    await context.close()
  },
})

export { expect }
