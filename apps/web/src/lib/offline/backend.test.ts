import { describe, expect, it } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { classifyError } from './backend'

const error = (message: string, code = '') =>
  ({ message, code, details: '', hint: '', name: 'PostgrestError' }) as PostgrestError

describe('clasificación de errores de sync', () => {
  it('sin error no hay falla', () => {
    expect(classifyError(null, 200)).toBeNull()
  })

  it('sin red se reintenta', () => {
    expect(classifyError(error('TypeError: Failed to fetch'), 0)).toEqual({
      retryable: true,
      message: 'Sin conexión',
    })
  })

  it('error del servidor o sesión vencida se reintenta', () => {
    expect(classifyError(error('boom'), 503)?.retryable).toBe(true)
    expect(classifyError(error('JWT expired', 'PGRST301'), 401)?.retryable).toBe(true)
  })

  it('un rechazo de validación o permisos es definitivo y conserva el mensaje humano', () => {
    expect(classifyError(error('El monto no es válido', 'P0001'), 400)).toEqual({
      retryable: false,
      message: 'El monto no es válido',
    })
    expect(
      classifyError(error('Solo el contador paga desde la caja', '42501'), 403)?.retryable,
    ).toBe(false)
  })
})
