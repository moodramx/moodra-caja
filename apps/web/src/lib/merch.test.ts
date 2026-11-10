import { describe, expect, it } from 'vitest'
import type { SaleLine } from './events'
import { describeVenta, feedText } from './humanize'
import {
  addToCart,
  cartTotals,
  changeDue,
  costOfExit,
  pendingStock,
  previewEntry,
  qtyInCart,
  removeFromCart,
  setQty,
  suggestedPayments,
  toggleGift,
} from './merch'
import { pendingEffects } from './offline/effects'
import type { OutboxOp } from './offline/db'

const playera = { variant_id: 'm', unit_price_cents: 35000 }
const sticker = { variant_id: 's', unit_price_cents: 5000 }

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

describe('carrito', () => {
  it('junta piezas iguales en una línea', () => {
    let cart: SaleLine[] = []
    cart = addToCart(cart, playera)
    cart = addToCart(cart, playera)
    cart = addToCart(cart, sticker)
    expect(cart).toEqual([
      { variant_id: 'm', unit_price_cents: 35000, qty: 2, is_gift: false },
      { variant_id: 's', unit_price_cents: 5000, qty: 1, is_gift: false },
    ])
    expect(cartTotals(cart)).toEqual({ pieces: 3, giftPieces: 0, total: 75000n })
  })

  it('3 playeras, una de regalo: se cobran 2', () => {
    let cart = addToCart([], playera)
    cart = toggleGift(cart, 0, 35000) // la primera es regalo
    cart = addToCart(cart, playera)
    cart = addToCart(cart, playera)
    expect(cart).toEqual([
      { variant_id: 'm', unit_price_cents: 0, qty: 1, is_gift: true },
      { variant_id: 'm', unit_price_cents: 35000, qty: 2, is_gift: false },
    ])
    expect(cartTotals(cart)).toEqual({ pieces: 3, giftPieces: 1, total: 70000n })
    expect(describeVenta(cartTotals(cart), 'efectivo')).toBe(
      'Vendiste 3 pzas por $700 en efectivo (1 de regalo).',
    )
  })

  it('quitar el regalo recupera el precio de lista y junta las líneas', () => {
    let cart = addToCart(addToCart([], playera), playera)
    cart = addToCart(cart, playera, true)
    cart = toggleGift(cart, 1, 35000)
    expect(cart).toEqual([{ variant_id: 'm', unit_price_cents: 35000, qty: 3, is_gift: false }])
  })

  it('cantidad en cero quita la línea', () => {
    const cart = addToCart(addToCart([], playera), sticker)
    expect(setQty(cart, 0, 0)).toEqual([
      { variant_id: 's', unit_price_cents: 5000, qty: 1, is_gift: false },
    ])
    expect(setQty(cart, 1, 4)[1]?.qty).toBe(4)
  })

  it('el contador − quita de una en una y desaparece la línea al llegar a cero', () => {
    let cart = addToCart(addToCart(addToCart([], playera), playera), sticker)
    expect(qtyInCart(cart, 'm')).toBe(2)
    cart = removeFromCart(cart, 'm')
    expect(qtyInCart(cart, 'm')).toBe(1)
    cart = removeFromCart(cart, 'm')
    expect(cart).toEqual([{ variant_id: 's', unit_price_cents: 5000, qty: 1, is_gift: false }])
    expect(removeFromCart(cart, 'm')).toBe(cart) // ya no hay: no cambia nada
  })

  it('el contador − quita primero las que se cobran y deja el regalo al final', () => {
    let cart = addToCart(addToCart([], playera, true), playera)
    cart = removeFromCart(cart, 'm')
    expect(cart).toEqual([{ variant_id: 'm', unit_price_cents: 0, qty: 1, is_gift: true }])
    expect(removeFromCart(cart, 'm')).toEqual([])
  })

  it('solo regalos: no se cobra nada', () => {
    const totals = cartTotals(addToCart([], playera, true))
    expect(totals.total).toBe(0n)
    expect(describeVenta(totals, 'efectivo')).toBe('Regalaste 1 pza.')
  })
})

describe('existencias y saldos optimistas (offline)', () => {
  const venta = op('venta_merch', {
    payment_method: 'efectivo',
    channel: 'show',
    lines: [
      { variant_id: 'm', qty: 2, unit_price_cents: 35000, is_gift: false },
      { variant_id: 'm', qty: 1, unit_price_cents: 0, is_gift: true },
    ],
  })

  it('las ventas pendientes ya descuentan del stock mostrado', () => {
    const ops = [
      venta,
      op('compra_merch', {
        paid_with: 'cuenta_banda',
        lines: [{ variant_id: 's', qty: 50, unit_cost_cents: 800 }],
      }),
      op('salida_merch', { kind: 'regalo', variant_id: 's', qty: 3 }),
      op(
        'venta_merch',
        { lines: [{ variant_id: 'm', qty: 9, unit_price_cents: 1, is_gift: false }] },
        'failed',
      ),
    ]
    expect(Object.fromEntries(pendingStock(ops))).toEqual({ m: -3, s: 47 })
  })

  it('el efectivo de la venta queda con quien cobró', () => {
    expect(pendingEffects([venta], 'me')).toEqual({ cash: 70000n, owed: 0n })
    const cobroOtro = op('venta_merch', { ...(venta.payload as object), collected_by: 'otro' })
    expect(pendingEffects([cobroOtro], 'me').cash).toBe(0n)
    const transferencia = op('venta_merch', {
      ...(venta.payload as object),
      payment_method: 'transferencia',
    })
    expect(pendingEffects([transferencia], 'me').cash).toBe(0n)
  })

  it('comprar merch con mi dinero suma a lo que me deben', () => {
    const compra = op('compra_merch', {
      paid_with: 'mi_dinero',
      settlement_pref: 'reembolso',
      lines: [{ variant_id: 'm', qty: 10, unit_cost_cents: 12000 }],
    })
    expect(pendingEffects([compra], 'me')).toEqual({ cash: 0n, owed: 120000n })
  })
})

describe('feed de merch', () => {
  const nameOf = () => 'Pepe'
  const row = (over: object) =>
    ({ created_by: 'p', status: 'registrado', ...over }) as Parameters<typeof feedText>[0]

  it('describe ventas, entradas, regalos y bajas sin jerga', () => {
    expect(
      feedText(row({ type: 'venta_merch', pieces: 3, amount_cents: 70000 }), nameOf).title,
    ).toBe('Pepe vendió 3 pzas de merch · $700')
    expect(
      feedText(row({ type: 'compra_merch', pieces: 10, amount_cents: 120000 }), nameOf).title,
    ).toBe('Pepe metió 10 pzas de merch · $1,200')
    expect(
      feedText(row({ type: 'salida_merch', stock_kind: 'regalo', pieces: 1 }), nameOf).title,
    ).toBe('Pepe regaló 1 pza de merch')
    expect(
      feedText(row({ type: 'salida_merch', stock_kind: 'merma', pieces: 2 }), nameOf).title,
    ).toBe('Se dieron de baja 2 pzas de merch')
  })
})

describe('calculadora de cambio', () => {
  it('calcula el cambio o lo que falta', () => {
    expect(changeDue(70000n, 100000n)).toBe(30000n)
    expect(changeDue(70000n, 70000n)).toBe(0n)
    expect(changeDue(70000n, 50000n)).toBe(-20000n)
  })

  it('sugiere el monto exacto y los billetes siguientes', () => {
    expect(suggestedPayments(70000n)).toEqual([70000n, 80000n, 100000n])
    expect(suggestedPayments(66000n)).toEqual([66000n, 70000n, 80000n, 100000n])
    expect(suggestedPayments(3000n)).toEqual([3000n, 5000n, 10000n, 20000n, 50000n])
    expect(suggestedPayments(0n)).toEqual([])
  })
})

describe('costo promedio (mismos números que pgTAP)', () => {
  const vacio = { stock: 0, valueCents: 0n, avgCostCents: 0n }

  it('dos compras: 10 a $120 y 5 a $150 → promedio $130', () => {
    const primera = previewEntry(vacio, 10, 12000n)
    expect(primera).toEqual({ stock: 10, valueCents: 120000n, avgCostCents: 12000n })
    expect(previewEntry(primera, 5, 15000n)).toEqual({
      stock: 15,
      valueCents: 195000n,
      avgCostCents: 13000n,
    })
  })

  it('salidas a costo promedio', () => {
    const hay = { stock: 15, valueCents: 195000n, avgCostCents: 13000n }
    expect(costOfExit(hay, 2)).toBe(26000n)
    expect(costOfExit({ stock: 13, valueCents: 169000n, avgCostCents: 13000n }, 1)).toBe(13000n)
  })

  it('sin residuos: 3 piezas a $33.33', () => {
    const hay = previewEntry(vacio, 3, 3333n)
    expect(costOfExit(hay, 2)).toBe(6666n)
    expect(costOfExit({ stock: 1, valueCents: 3333n, avgCostCents: 3333n }, 1)).toBe(3333n)
  })

  it('vender más de lo que hay usa el último costo promedio', () => {
    expect(costOfExit({ stock: 2, valueCents: 26000n, avgCostCents: 13000n }, 3)).toBe(39000n)
    expect(costOfExit({ stock: -1, valueCents: 0n, avgCostCents: 0n }, 1)).toBe(0n)
  })
})
