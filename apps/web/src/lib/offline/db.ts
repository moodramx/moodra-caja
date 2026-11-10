import Dexie, { type Table } from 'dexie'
import type { EventType, SubmitPayload } from '../events'

/** Operación pendiente de mandar al servidor. Todas son idempotentes. */
export interface OutboxOp {
  /** Para `submit` es el client_id del evento; para las demás, un id propio. */
  client_id: string
  user_id: string
  kind: 'submit' | 'void' | 'confirm'
  /** Solo `submit`. */
  type?: EventType
  payload?: SubmitPayload
  captured_at: string
  /** `void`/`confirm`: evento del servidor… */
  event_id?: string
  /** …o, si aún no se sincroniza, el client_id del evento capturado aquí. */
  target_client_id?: string
  reason?: string
  accept?: boolean
  state: 'pending' | 'failed'
  attempts: number
  next_attempt_at: number
  last_error?: string
  created_at: number
}

export interface KV {
  key: string
  value: string
}

/** Foto guardada para verse sin señal. */
export interface Photo {
  path: string
  blob: Blob
}

export class MoodraDB extends Dexie {
  outbox!: Table<OutboxOp, string>
  kv!: Table<KV, string>
  photos!: Table<Photo, string>

  constructor(name = 'moodra-caja') {
    super(name)
    this.version(1).stores({
      outbox: 'client_id, created_at, state, user_id',
      kv: 'key',
    })
    this.version(2).stores({ photos: 'path' })
  }
}

export const db = new MoodraDB()
