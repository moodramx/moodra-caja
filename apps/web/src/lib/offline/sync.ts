// Motor de sincronización del outbox. Regla: primero se guarda local, luego se
// manda. Cada operación es idempotente en el servidor (client_id), así que
// reintentar nunca duplica.
import type { MoodraDB, OutboxOp } from './db'
import type { EventType, SubmitPayload } from '../events'
import { uuidv7 } from './uuid'

export interface RpcError {
  /** true: sin red o error del servidor → se reintenta. false: lo rechazó → no se reintenta. */
  retryable: boolean
  message: string
}
export type RpcResult = { ok: true; data?: unknown } | { ok: false; error: RpcError }

/** Lo único que el motor necesita del backend (se simula en las pruebas). */
export interface Backend {
  submitEvent(op: OutboxOp): Promise<RpcResult>
  voidEvent(eventId: string, reason: string): Promise<RpcResult>
  confirmTransfer(eventId: string, accept: boolean): Promise<RpcResult>
  /** Busca el id de servidor de un evento por su client_id. */
  findEventId(
    clientId: string,
  ): Promise<{ ok: true; id: string | null } | { ok: false; error: RpcError }>
}

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 5 * 60_000

/** Backoff exponencial: 2 s, 4 s, 8 s… hasta 5 min. */
export function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS)
}

export class SyncEngine {
  private running: Promise<void> | null = null
  private again = false
  private lastStamp = 0
  /** Se llama cuando al menos una operación llegó al servidor. */
  onSynced: () => void = () => {}

  constructor(
    private db: MoodraDB,
    private backend: Backend,
    private onChange: () => void = () => {},
    private now: () => number = Date.now,
  ) {}

  /** Marca de orden estrictamente creciente: dos operaciones nunca empatan. */
  private stamp(): number {
    this.lastStamp = Math.max(this.now(), this.lastStamp + 1)
    return this.lastStamp
  }

  /** Guarda una captura en el outbox y devuelve su client_id. */
  async enqueueSubmit(
    userId: string,
    type: EventType,
    payload: SubmitPayload,
    capturedAt = new Date(this.now()),
  ): Promise<string> {
    const client_id = uuidv7(this.now())
    await this.db.outbox.add({
      client_id,
      user_id: userId,
      kind: 'submit',
      type,
      payload,
      captured_at: capturedAt.toISOString(),
      state: 'pending',
      attempts: 0,
      next_attempt_at: 0,
      created_at: this.stamp(),
    })
    this.onChange()
    return client_id
  }

  /**
   * Anula un evento. Si la captura sigue en este celular y nunca se mandó,
   * simplemente se descarta: el servidor nunca la vio.
   */
  async enqueueVoid(
    userId: string,
    target: { event_id: string } | { client_id: string },
    reason: string,
  ): Promise<void> {
    if ('client_id' in target) {
      const original = await this.db.outbox.get(target.client_id)
      if (original && original.kind === 'submit' && original.attempts === 0 && !this.running) {
        await this.db.outbox.delete(target.client_id)
        this.onChange()
        return
      }
    }
    await this.db.outbox.add({
      client_id: uuidv7(this.now()),
      user_id: userId,
      kind: 'void',
      ...('event_id' in target
        ? { event_id: target.event_id }
        : { target_client_id: target.client_id }),
      reason,
      captured_at: new Date(this.now()).toISOString(),
      state: 'pending',
      attempts: 0,
      next_attempt_at: 0,
      created_at: this.stamp(),
    })
    this.onChange()
  }

  async enqueueConfirm(userId: string, eventId: string, accept: boolean): Promise<void> {
    await this.db.outbox.add({
      client_id: uuidv7(this.now()),
      user_id: userId,
      kind: 'confirm',
      event_id: eventId,
      accept,
      captured_at: new Date(this.now()).toISOString(),
      state: 'pending',
      attempts: 0,
      next_attempt_at: 0,
      created_at: this.stamp(),
    })
    this.onChange()
  }

  /** Vuelve a poner en cola una operación que el servidor rechazó. */
  async retry(clientId: string): Promise<void> {
    await this.db.outbox.update(clientId, {
      state: 'pending',
      next_attempt_at: 0,
      last_error: undefined,
    })
    this.onChange()
  }

  async discard(clientId: string): Promise<void> {
    await this.db.outbox.delete(clientId)
    this.onChange()
  }

  /** Manda lo pendiente del usuario. Si ya está corriendo, agenda otra pasada. */
  sync(userId: string, opts: { force?: boolean } = {}): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.drain(userId, opts.force ?? false).finally(() => {
      this.running = null
      if (this.again) {
        this.again = false
        void this.sync(userId)
      }
    })
    return this.running
  }

  private async drain(userId: string, force: boolean): Promise<void> {
    const ops = (await this.db.outbox.orderBy('created_at').toArray()).filter(
      (op) => op.user_id === userId && op.state === 'pending',
    )
    let synced = false
    for (const op of ops) {
      if (!force && op.next_attempt_at > this.now()) break // respeta el backoff y el orden
      const result = await this.send(op)
      if (result.ok) {
        await this.db.outbox.delete(op.client_id)
        synced = true
      } else if (result.error.retryable) {
        const attempts = op.attempts + 1
        await this.db.outbox.update(op.client_id, {
          attempts,
          next_attempt_at: this.now() + backoffDelay(attempts),
          last_error: result.error.message,
        })
        this.onChange()
        break // sin red: no tiene caso seguir, y así se conserva el orden
      } else {
        await this.db.outbox.update(op.client_id, {
          state: 'failed',
          attempts: op.attempts + 1,
          last_error: result.error.message,
        })
      }
      this.onChange()
    }
    if (synced) this.onSynced()
  }

  private async send(op: OutboxOp): Promise<RpcResult> {
    if (op.kind === 'submit') return this.backend.submitEvent(op)

    let eventId = op.event_id
    if (!eventId && op.target_client_id) {
      const found = await this.backend.findEventId(op.target_client_id)
      if (!found.ok) return found
      if (!found.id) {
        // Si la captura sigue en la cola, aún puede llegar: se espera. Si ya no
        // está (se descartó o el servidor la rechazó), no hay nada que anular.
        const original = await this.db.outbox.get(op.target_client_id)
        if (original?.state === 'pending') {
          return {
            ok: false,
            error: { retryable: true, message: 'Esperando a que llegue el registro' },
          }
        }
        return { ok: true }
      }
      eventId = found.id
    }
    if (!eventId) return { ok: false, error: { retryable: false, message: 'Operación incompleta' } }

    return op.kind === 'void'
      ? this.backend.voidEvent(eventId, op.reason ?? 'Deshecho')
      : this.backend.confirmTransfer(eventId, op.accept ?? false)
  }
}
