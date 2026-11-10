import { describe, expect, it } from 'vitest'
import type { FeedRow } from './events'
import {
  describeEntrega,
  describeGasto,
  describeIngreso,
  describePuse,
  describeRegreso,
  feedText,
  INCOME_PLACE_OPTIONS,
  PAID_WITH_OPTIONS,
  SETTLEMENT_OPTIONS,
  timeAgo,
} from './humanize'
import { pendingEffects } from './offline/effects'
import type { OutboxOp } from './offline/db'

const JERGA = /\b(cargo|abono|p[oó]liza|asiento|debe|haber|pasivo|activo|patrimonio|cuenta \d)/i
const transporte = { emoji: '⛽', name: 'Transporte' }

describe('resúmenes en lenguaje humano', () => {
  it('gasto con mi dinero en gira (ejemplo del PRD §4.2)', () => {
    expect(
      describeGasto(
        {
          amount_cents: 85000,
          category_id: 'c',
          paid_with: 'mi_dinero',
          settlement_pref: 'reembolso',
        },
        transporte,
        'el show de Querétaro',
      ),
    ).toBe(
      'Gastaste $850 en ⛽ Transporte para el show de Querétaro, con tu dinero. Te lo regresamos.',
    )
  })

  it('gasto con efectivo de la banda, sin contexto', () => {
    expect(
      describeGasto(
        { amount_cents: 12050, category_id: 'c', paid_with: 'efectivo_banda' },
        transporte,
      ),
    ).toBe('Gastaste $120.50 en ⛽ Transporte, con efectivo de la banda.')
  })

  it('cobro, entrega y puse dinero', () => {
    expect(
      describeIngreso(
        { amount_cents: 120000, category_id: 'c', destination: 'cuenta_banda' },
        { emoji: '🎵', name: 'Streaming (DistroKid)' },
      ),
    ).toBe('Cobraste $1,200 de 🎵 Streaming (DistroKid). Llegó a la cuenta de la banda.')
    expect(
      describeEntrega({ amount_cents: 200000, to_kind: 'integrante', to_member: 'x' }, 'Ram'),
    ).toBe('Le pasaste $2,000 a Ram. Cuenta en cuanto confirme que lo recibió.')
    expect(describeEntrega({ amount_cents: 50000, to_kind: 'banco' })).toBe(
      'Depositaste $500 en la cuenta de la banda.',
    )
    expect(
      describePuse({ amount_cents: 700000, destination: 'cuenta_banda', kind: 'prestamo' }),
    ).toBe('Pusiste $7,000 en la cuenta de la banda. Te lo regresamos.')
  })

  it('regresar dinero', () => {
    const p = { amount_cents: 50000, member_id: 'p', origin: 'cuenta_banda' } as const
    expect(describeRegreso(p, 'Pepe', 85000n)).toBe(
      'Le regresaste $500 a Pepe desde la cuenta de la banda. Todavía le debemos $350.',
    )
    expect(describeRegreso({ ...p, amount_cents: 85000 }, 'Pepe', 85000n)).toBe(
      'Le regresaste $850 a Pepe desde la cuenta de la banda. Ya estamos a mano con Pepe.',
    )
    expect(describeRegreso({ ...p, origin: 'efectivo_integrante' }, 'Diego', 50000n, true)).toBe(
      'Te regresaste $500 con el efectivo de la banda que traes. Ya estás a mano con la banda.',
    )
  })

  it('nunca usa lenguaje contable', () => {
    const textos = [
      ...PAID_WITH_OPTIONS.map((o) => o.label),
      ...SETTLEMENT_OPTIONS.map((o) => o.label),
      ...INCOME_PLACE_OPTIONS.map((o) => o.label),
      describeGasto({ amount_cents: 1, category_id: 'c', paid_with: 'pendiente' }, transporte),
      describeGasto(
        {
          amount_cents: 1,
          category_id: 'c',
          paid_with: 'mi_dinero',
          settlement_pref: 'aportacion',
        },
        transporte,
      ),
      describePuse({ amount_cents: 1, destination: 'caja', kind: 'aportacion' }),
    ]
    for (const texto of textos) expect(texto).not.toMatch(JERGA)
  })
})

describe('feed', () => {
  const nameOf = (id: string | null) => ({ p: 'Pepe', r: 'Ram' })[id ?? ''] ?? 'Alguien'
  const row = (over: Partial<FeedRow>) =>
    ({ created_by: 'p', amount_cents: 85000, status: 'registrado', ...over }) as FeedRow

  it('describe cada tipo de movimiento', () => {
    expect(
      feedText(row({ type: 'gasto', category_name: 'Transporte', category_emoji: '⛽' }), nameOf),
    ).toEqual({
      emoji: '⛽',
      title: 'Pepe gastó $850 en Transporte',
      badge: undefined,
    })
    expect(
      feedText(
        row({
          type: 'entrega_efectivo',
          to_kind: 'integrante',
          to_member: 'r',
          status: 'pendiente_confirmacion',
        }),
        nameOf,
      ),
    ).toEqual({ emoji: '🤝', title: 'Pepe le pasó $850 a Ram', badge: 'por confirmar' })
    expect(feedText(row({ type: 'puse_dinero', fund_kind: 'aportacion' }), nameOf).title).toBe(
      'Pepe puso $850 como aportación',
    )
    expect(feedText(row({ type: 'regreso_dinero', fund_member: 'r' }), nameOf).title).toBe(
      'Se le regresaron $850 a Ram',
    )
    expect(feedText(row({ type: 'gasto', status: 'anulado' }), nameOf).badge).toBe('anulado')
  })

  it('ningún texto del feed usa jerga', () => {
    for (const type of [
      'gasto',
      'ingreso',
      'entrega_efectivo',
      'puse_dinero',
      'reclasificacion',
      'regreso_dinero',
      'pago_proveedor',
    ] as const) {
      expect(feedText(row({ type }), nameOf).title).not.toMatch(JERGA)
    }
  })

  it('tiempos relativos', () => {
    const now = new Date('2026-11-14T20:00:00')
    expect(timeAgo('2026-11-14T19:59:40', now)).toBe('ahorita')
    expect(timeAgo('2026-11-14T19:30:00', now)).toBe('hace 30 min')
    expect(timeAgo('2026-11-13T22:00:00', now)).toBe('ayer')
  })
})

describe('saldos optimistas', () => {
  const op = (
    type: OutboxOp['type'],
    payload: object,
    state: OutboxOp['state'] = 'pending',
  ): OutboxOp => ({
    client_id: Math.random().toString(),
    user_id: 'me',
    kind: 'submit',
    type,
    payload: payload as OutboxOp['payload'],
    captured_at: '',
    state,
    attempts: 0,
    next_attempt_at: 0,
    created_at: 0,
  })

  it('aplica las mismas reglas que el servidor', () => {
    const ops = [
      op('gasto', { amount_cents: 85000, paid_with: 'efectivo_banda' }),
      op('gasto', { amount_cents: 50000, paid_with: 'mi_dinero', settlement_pref: 'reembolso' }),
      op('gasto', { amount_cents: 30000, paid_with: 'mi_dinero', settlement_pref: 'aportacion' }),
      op('gasto', { amount_cents: 40000, paid_with: 'cuenta_banda' }),
      op('ingreso', { amount_cents: 300000, destination: 'efectivo_integrante' }),
      op('puse_dinero', { amount_cents: 200000, destination: 'cuenta_banda', kind: 'prestamo' }),
      op('entrega_efectivo', { amount_cents: 20000, to_kind: 'integrante', to_member: 'x' }),
    ]
    expect(pendingEffects(ops, 'me')).toEqual({ cash: 215000n, owed: 250000n })
  })

  it('regresar dinero baja lo que se debe y el efectivo de quien paga', () => {
    const ops = [
      op('regreso_dinero', { amount_cents: 30000, member_id: 'me', origin: 'efectivo_integrante' }),
      op('regreso_dinero', { amount_cents: 10000, member_id: 'otro', origin: 'cuenta_banda' }),
    ]
    expect(pendingEffects(ops, 'me')).toEqual({ cash: -30000n, owed: -30000n })
  })

  it('ignora lo rechazado y lo de otros usuarios', () => {
    const ops = [
      op('gasto', { amount_cents: 100, paid_with: 'efectivo_banda' }, 'failed'),
      { ...op('gasto', { amount_cents: 100, paid_with: 'efectivo_banda' }), user_id: 'otro' },
    ]
    expect(pendingEffects(ops, 'me')).toEqual({ cash: 0n, owed: 0n })
  })

  it('la entrega a caja cuenta de inmediato solo para el contador', () => {
    const ops = [op('entrega_efectivo', { amount_cents: 5000, to_kind: 'caja' })]
    expect(pendingEffects(ops, 'me').cash).toBe(0n)
    expect(pendingEffects(ops, 'me', true).cash).toBe(-5000n)
  })
})
