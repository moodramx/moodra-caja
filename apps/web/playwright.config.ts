import { defineConfig, devices } from '@playwright/test'

// Flujos clave en viewport móvil (390×844) contra el build de producción.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Las pruebas reales comparten una sola base local: van una tras otra para
  // que lo que captura una no mueva los números que otra está midiendo.
  workers: process.env.E2E_REAL === '1' ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  projects: [
    {
      name: 'movil',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
