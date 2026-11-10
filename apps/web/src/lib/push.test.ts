import { describe, expect, it } from 'vitest'
import { keyToBytes, NOTIFICATION_TYPES } from './push'

describe('notificaciones push', () => {
  it('convierte la llave pública base64url a bytes', () => {
    // "-_8" en base64url es "+/8=" en base64: bytes 251, 255.
    expect([...keyToBytes('-_8')]).toEqual([251, 255])
    expect([...keyToBytes('AQID')]).toEqual([1, 2, 3])
    // Una llave VAPID real mide 65 bytes y empieza con 4 (punto sin comprimir).
    const key = keyToBytes(
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    )
    expect(key).toHaveLength(65)
    expect(key[0]).toBe(4)
  })

  it('los tipos de aviso que se pueden silenciar son los del servidor', () => {
    expect(NOTIFICATION_TYPES.map((t) => t.key).sort()).toEqual([
      'efectivo_alto',
      'entrega_recibida',
      'entrega_respuesta',
      'entregas_pendientes',
      'resumen',
      'show_sin_cerrar',
      'stock',
    ])
  })
})
