import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { Json } from '../database.types'
import type { Backend, RpcError, RpcResult } from './sync'

/**
 * Sin red, error del servidor o sesión vencida → se reintenta.
 * Cualquier otro rechazo (validación, permisos) es definitivo.
 */
export function classifyError(error: PostgrestError | null, status: number): RpcError | null {
  if (!error) return null
  const network = status === 0 || /fetch|network|load failed|timeout/i.test(error.message)
  const retryable = network || status >= 500 || status === 401 || status === 408 || status === 429
  return {
    retryable,
    message: network ? 'Sin conexión' : error.message || 'No se pudo guardar',
  }
}

function toResult(error: PostgrestError | null, status: number, data?: unknown): RpcResult {
  const failure = classifyError(error, status)
  return failure ? { ok: false, error: failure } : { ok: true, data }
}

export const supabaseBackend: Backend = {
  async submitEvent(op) {
    const { data, error, status } = await supabase.rpc('submit_event', {
      p_client_id: op.client_id,
      p_type: op.type!,
      p_payload: { ...op.payload, device: navigator.userAgent.slice(0, 200) } as unknown as Json,
      p_captured_at: op.captured_at,
    })
    return toResult(error, status, data)
  },

  async voidEvent(eventId, reason) {
    const { data, error, status } = await supabase.rpc('void_event', {
      p_event_id: eventId,
      p_reason: reason,
    })
    return toResult(error, status, data)
  },

  async confirmTransfer(eventId, accept) {
    const { data, error, status } = await supabase.rpc('confirm_cash_transfer', {
      p_event_id: eventId,
      p_accept: accept,
    })
    return toResult(error, status, data)
  },

  async findEventId(clientId) {
    const { data, error, status } = await supabase
      .from('events')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle()
    const failure = classifyError(error, status)
    return failure ? { ok: false, error: failure } : { ok: true, id: data?.id ?? null }
  },
}
