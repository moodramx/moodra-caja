// Actualización de la app instalada. El navegador solo busca versión nueva al
// navegar; una app instalada que se queda abierta en segundo plano puede pasar
// días sin enterarse. Aquí se busca al volver a la app, cada media hora y a mano.
import { registerSW } from 'virtual:pwa-register'

declare const __BUILD__: string
/** Fecha y hora en que se construyó esta versión, p. ej. "10 nov 2026, 14:05". */
export const BUILD_LABEL: string = __BUILD__

let registration: ServiceWorkerRegistration | undefined
let lastCheck = 0

async function check() {
  if (!registration || !navigator.onLine) return
  lastCheck = Date.now()
  try {
    await registration.update()
  } catch {
    // Sin señal o servidor caído: se intenta en la siguiente vuelta.
  }
}

/** Registra el service worker; con versión nueva, la app se recarga sola. */
export function startUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
      setInterval(() => void check(), 30 * 60_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60_000) void check()
      })
    },
  })
}

/**
 * Búsqueda a mano desde Más. Devuelve true si había versión nueva (la app se
 * recarga sola en unos segundos) y false si ya está al día o no hay señal.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false
  await check()
  return Boolean(registration.installing ?? registration.waiting)
}
