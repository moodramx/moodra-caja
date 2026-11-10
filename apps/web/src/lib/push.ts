// Notificaciones push (Web Push). El dispositivo se suscribe con la llave
// pública que entrega la función `notify`; el envío lo hace el servidor.
import { supabase } from './supabase'

export const NOTIFICATION_TYPES = [
  { key: 'entrega_recibida', label: 'Te pasaron efectivo y falta que confirmes' },
  { key: 'entrega_respuesta', label: 'Confirmaron o rechazaron tu entrega' },
  { key: 'show_sin_cerrar', label: 'Un show de ayer sigue sin cerrar' },
  { key: 'resumen', label: 'Resumen de cada noche en gira' },
  { key: 'efectivo_alto', label: 'Traes mucho efectivo de la banda desde hace días' },
  { key: 'stock', label: 'Se está acabando la merch (contador)' },
  { key: 'entregas_pendientes', label: 'Entregas con más de 2 días sin confirmar (contador)' },
] as const

export type PushState =
  | 'no_soportado' // el navegador no puede (en iPhone hay que instalar la app primero)
  | 'bloqueado' // el usuario dijo que no en el sistema
  | 'sin_configurar' // faltan las llaves en el servidor
  | 'apagado'
  | 'encendido'

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

/** Llave pública en base64url → bytes, como la pide el navegador. */
export function keyToBytes(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const raw = atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'encendido' : 'apagado'
}

/** Pide permiso, suscribe este dispositivo y guarda la suscripción. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'no_soportado'
  const { data } = await supabase.functions.invoke('notify', { method: 'GET' })
  const info = (data ?? {}) as { configured?: boolean; publicKey?: string | null }
  if (!info.configured || !info.publicKey) return 'sin_configurar'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'bloqueado' : 'apagado'
  const reg = await registration()
  if (!reg) return 'no_soportado'

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(info.publicKey) as BufferSource,
    }))
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return 'encendido'
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'apagado'
}

let pingTimer: ReturnType<typeof setTimeout> | undefined
/**
 * Avisa al servidor que hubo movimientos para que mande las notificaciones que
 * correspondan (a quien le pasaron efectivo, etc.). Se junta en una sola llamada.
 */
export function pingNotify() {
  clearTimeout(pingTimer)
  pingTimer = setTimeout(() => {
    if (!navigator.onLine) return
    void supabase.functions.invoke('notify', { body: {} }).catch(() => {})
  }, 1500)
}
