import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { MoodraDB, type OutboxOp } from './db'
import { backoffDelay, SyncEngine, type Backend, type RpcResult } from './sync'
import { uuidv7 } from './uuid'

const USER = 'u-pepe'
const gasto = {
  amount_cents: 85000,
  category_id: 'c1',
  paid_with: 'mi_dinero',
  settlement_pref: 'reembolso',
} as const

/** Servidor falso: idempotente por client_id, con interruptor de red. */
function fakeServer() {
  const events = new Map<string, { id: string; voided: boolean; confirmed?: boolean }>()
  const calls: string[] = []
  const state = { online: true, reject: null as string | null }
  const offline: RpcResult = { ok: false, error: { retryable: true, message: 'sin red' } }

  const backend: Backend = {
    async submitEvent(op: OutboxOp) {
      calls.push(`submit:${op.client_id}`)
      if (!state.online) return offline
      if (state.reject) return { ok: false, error: { retryable: false, message: state.reject } }
      if (!events.has(op.client_id))
        events.set(op.client_id, { id: `ev-${events.size + 1}`, voided: false })
      return { ok: true }
    },
    async voidEvent(eventId) {
      calls.push(`void:${eventId}`)
      if (!state.online) return offline
      for (const event of events.values()) if (event.id === eventId) event.voided = true
      return { ok: true }
    },
    async confirmTransfer(eventId, accept) {
      calls.push(`confirm:${eventId}:${accept}`)
      if (!state.online) return offline
      return { ok: true }
    },
    async findEventId(clientId) {
      if (!state.online) return offline
      return { ok: true, id: events.get(clientId)?.id ?? null }
    },
  }
  return { backend, events, calls, state }
}

let db: MoodraDB
let clock: number
let server: ReturnType<typeof fakeServer>
let engine: SyncEngine

beforeEach(async () => {
  db = new MoodraDB(`test-${uuidv7()}`)
  clock = 1_800_000_000_000
  server = fakeServer()
  engine = new SyncEngine(
    db,
    server.backend,
    () => {},
    () => clock,
  )
})

describe('uuidv7', () => {
  it('tiene formato v7 y se ordena por tiempo', () => {
    const a = uuidv7(1_000)
    const b = uuidv7(2_000)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
    expect(uuidv7(1_000)).not.toBe(a)
  })
})

describe('backoff', () => {
  it('crece exponencialmente con tope de 5 minutos', () => {
    expect(backoffDelay(1)).toBe(2_000)
    expect(backoffDelay(2)).toBe(4_000)
    expect(backoffDelay(4)).toBe(16_000)
    expect(backoffDelay(30)).toBe(300_000)
  })
})

describe('outbox + sync', () => {
  it('guarda primero local: la captura existe aunque no haya red', async () => {
    server.state.online = false
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)

    const op = await db.outbox.get(id)
    expect(op?.state).toBe('pending')
    expect(op?.attempts).toBe(1)
    expect(server.events.size).toBe(0)
  })

  it('al volver la red se sincroniza una sola vez y sale del outbox', async () => {
    server.state.online = false
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)

    server.state.online = true
    await engine.sync(USER) // todavía en backoff: no se manda
    expect(server.events.size).toBe(0)

    clock += backoffDelay(1)
    await engine.sync(USER)
    await engine.sync(USER)
    expect(server.events.size).toBe(1)
    expect(await db.outbox.count()).toBe(0)
    expect(server.calls.filter((c) => c === `submit:${id}`)).toHaveLength(2) // 1 fallida + 1 buena
  })

  it('reenviar el mismo evento no lo duplica (idempotencia por client_id)', async () => {
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    const op = (await db.outbox.get(id))!
    await engine.sync(USER)
    // La respuesta se perdió y el celular lo vuelve a mandar:
    await db.outbox.add(op)
    await engine.sync(USER)
    expect(server.events.size).toBe(1)
  })

  it('conserva el orden y se detiene al perder la red', async () => {
    const a = await engine.enqueueSubmit(USER, 'gasto', gasto)
    clock += 10
    const b = await engine.enqueueSubmit(USER, 'gasto', gasto)
    server.state.online = false
    await engine.sync(USER)
    expect(server.calls).toEqual([`submit:${a}`]) // no intenta b
    server.state.online = true
    await engine.sync(USER, { force: true })
    expect(server.calls.slice(1)).toEqual([`submit:${a}`, `submit:${b}`])
  })

  it('un rechazo del servidor no se reintenta y no bloquea lo demás', async () => {
    server.state.reject = 'El monto no es válido'
    const bad = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)
    server.state.reject = null
    clock += 10
    await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)

    const failed = await db.outbox.get(bad)
    expect(failed?.state).toBe('failed')
    expect(failed?.last_error).toBe('El monto no es válido')
    expect(server.events.size).toBe(1)

    await engine.retry(bad)
    await engine.sync(USER)
    expect(server.events.size).toBe(2)
  })

  it('"Deshacer" antes de sincronizar descarta la captura sin tocar el servidor', async () => {
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.enqueueVoid(USER, { client_id: id }, 'Deshecho')
    await engine.sync(USER)
    expect(await db.outbox.count()).toBe(0)
    expect(server.calls).toEqual([])
  })

  it('"Deshacer" después de sincronizar anula en el servidor', async () => {
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)
    await engine.enqueueVoid(USER, { client_id: id }, 'Deshecho')
    await engine.sync(USER)
    expect(server.events.get(id)?.voided).toBe(true)
    expect(await db.outbox.count()).toBe(0)
  })

  it('si la captura ya se intentó mandar, la anulación espera a que llegue', async () => {
    server.state.online = false
    const id = await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER) // intento fallido: quizá sí llegó
    await engine.enqueueVoid(USER, { client_id: id }, 'Deshecho')
    server.state.online = true
    await engine.sync(USER, { force: true })
    expect(server.events.get(id)?.voided).toBe(true)
  })

  it('avisa cuando algo llegó al servidor, para refrescar lecturas', async () => {
    let synced = 0
    engine.onSynced = () => synced++
    server.state.online = false
    await engine.enqueueSubmit(USER, 'gasto', gasto)
    await engine.sync(USER)
    expect(synced).toBe(0)
    server.state.online = true
    await engine.sync(USER, { force: true })
    expect(synced).toBe(1)
  })

  it('confirma una entrega', async () => {
    await engine.enqueueConfirm(USER, 'ev-9', true)
    await engine.sync(USER)
    expect(server.calls).toEqual(['confirm:ev-9:true'])
  })

  it('no manda lo de otro usuario del mismo celular', async () => {
    await engine.enqueueSubmit('u-otro', 'gasto', gasto)
    await engine.sync(USER)
    expect(server.calls).toEqual([])
    expect(await db.outbox.count()).toBe(1)
  })
})
