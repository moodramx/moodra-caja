// Lógica pura del punto de venta: carrito, totales y existencias optimistas.
import type { CompraPayload, SaleLine, SalidaPayload, VentaPayload } from './events'
import type { OutboxOp } from './offline/db'

export interface CartTotals {
  pieces: number
  giftPieces: number
  total: bigint
}

export function cartTotals(lines: SaleLine[]): CartTotals {
  let pieces = 0
  let giftPieces = 0
  let total = 0n
  for (const line of lines) {
    pieces += line.qty
    if (line.is_gift) giftPieces += line.qty
    else total += BigInt(line.unit_price_cents) * BigInt(line.qty)
  }
  return { pieces, giftPieces, total }
}

/** Agrega una pieza al carrito (una línea por variante y por si es regalo). */
export function addToCart(
  lines: SaleLine[],
  variant: { variant_id: string; unit_price_cents: number },
  isGift = false,
): SaleLine[] {
  const index = lines.findIndex((l) => l.variant_id === variant.variant_id && l.is_gift === isGift)
  if (index === -1) {
    return [
      ...lines,
      {
        ...variant,
        unit_price_cents: isGift ? 0 : variant.unit_price_cents,
        qty: 1,
        is_gift: isGift,
      },
    ]
  }
  return lines.map((line, i) => (i === index ? { ...line, qty: line.qty + 1 } : line))
}

/** Cambia la cantidad de una línea; en cero, la quita. */
export function setQty(lines: SaleLine[], index: number, qty: number): SaleLine[] {
  if (qty <= 0) return lines.filter((_, i) => i !== index)
  return lines.map((line, i) => (i === index ? { ...line, qty } : line))
}

/** Marca o desmarca una línea como regalo; si ya existe su gemela, las junta. */
export function toggleGift(lines: SaleLine[], index: number, listPriceCents: number): SaleLine[] {
  const line = lines[index]
  if (!line) return lines
  const flipped: SaleLine = {
    ...line,
    is_gift: !line.is_gift,
    unit_price_cents: line.is_gift ? listPriceCents : 0,
  }
  const twin = lines.findIndex(
    (l, i) => i !== index && l.variant_id === flipped.variant_id && l.is_gift === flipped.is_gift,
  )
  if (twin === -1) return lines.map((l, i) => (i === index ? flipped : l))
  return lines
    .map((l, i) => (i === twin ? { ...l, qty: l.qty + flipped.qty } : l))
    .filter((_, i) => i !== index)
}

/**
 * Existencias optimistas: cuántas piezas por variante se movieron en este
 * celular y aún no llegan al servidor (ventas restan, compras suman).
 */
export function pendingStock(ops: OutboxOp[]): Map<string, number> {
  const delta = new Map<string, number>()
  const add = (variantId: string, qty: number) =>
    delta.set(variantId, (delta.get(variantId) ?? 0) + qty)

  for (const op of ops) {
    if (op.kind !== 'submit' || op.state !== 'pending' || !op.payload) continue
    if (op.type === 'venta_merch') {
      for (const line of (op.payload as VentaPayload).lines) add(line.variant_id, -line.qty)
    } else if (op.type === 'compra_merch') {
      for (const line of (op.payload as CompraPayload).lines) add(line.variant_id, line.qty)
    } else if (op.type === 'salida_merch') {
      const p = op.payload as SalidaPayload
      add(p.variant_id, -p.qty)
    }
  }
  return delta
}

/** Cambio a devolver. Negativo = todavía falta dinero. */
export function changeDue(totalCents: bigint, paidCents: bigint): bigint {
  return paidCents - totalCents
}

/** Billetes sugeridos para "¿con cuánto te pagan?": exacto y los siguientes redondos. */
export function suggestedPayments(totalCents: bigint): bigint[] {
  if (totalCents <= 0n) return []
  const options = new Set<bigint>([totalCents])
  for (const bill of [5000n, 10000n, 20000n, 50000n, 100000n]) {
    const rounded = ((totalCents + bill - 1n) / bill) * bill
    if (rounded > totalCents) options.add(rounded)
  }
  return [...options].sort((x, y) => (x < y ? -1 : 1)).slice(0, 5)
}

export interface StockState {
  stock: number
  valueCents: bigint
  avgCostCents: bigint
}

/** Cómo queda el inventario al entrar piezas: mismo cálculo que la base (costo promedio ponderado). */
export function previewEntry(before: StockState, qty: number, unitCostCents: bigint): StockState {
  const stock = before.stock + qty
  const valueCents = before.valueCents + BigInt(qty) * unitCostCents
  const avgCostCents =
    stock > 0 && valueCents >= 0n ? roundDiv(valueCents, BigInt(stock)) : unitCostCents
  return { stock, valueCents, avgCostCents }
}

/** Costo con el que salen piezas (venta, regalo, merma): mismo cálculo que la base. */
export function costOfExit(before: StockState, qty: number): bigint {
  if (qty <= 0) return 0n
  let cost: bigint
  if (before.stock >= qty) {
    cost =
      qty === before.stock
        ? before.valueCents
        : roundDiv(before.valueCents * BigInt(qty), BigInt(before.stock))
  } else {
    cost =
      (before.stock > 0 ? before.valueCents : 0n) +
      BigInt(qty - Math.max(before.stock, 0)) * before.avgCostCents
  }
  return cost > 0n ? cost : 0n
}

/** División entera redondeando al más cercano (como round() de Postgres). */
function roundDiv(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (b * 2n)
}

/** Cuántas piezas de una variante hay en el carrito (vendidas + de regalo). */
export function qtyInCart(lines: SaleLine[], variantId: string): number {
  return lines.filter((l) => l.variant_id === variantId).reduce((sum, l) => sum + l.qty, 0)
}

/** Quita una pieza de una variante: primero de las que se cobran y, si no hay, de las de regalo. */
export function removeFromCart(lines: SaleLine[], variantId: string): SaleLine[] {
  const paid = lines.findIndex((l) => l.variant_id === variantId && !l.is_gift)
  const index = paid !== -1 ? paid : lines.findIndex((l) => l.variant_id === variantId)
  if (index === -1) return lines
  return setQty(lines, index, lines[index]!.qty - 1)
}
