// Si este dispositivo ya vio los primeros pasos.
const SEEN_KEY = 'moodra-caja-primeros-pasos'

/** true si este dispositivo todavía no ha visto los primeros pasos. */
export function shouldShowOnboarding(): boolean {
  try {
    // En pruebas automatizadas no se abre sola (estorbaría en todos los flujos).
    if (navigator.webdriver) return false
    return localStorage.getItem(SEEN_KEY) !== '1'
  } catch {
    return false
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Sin almacenamiento: se volverá a mostrar, no pasa nada.
  }
}
