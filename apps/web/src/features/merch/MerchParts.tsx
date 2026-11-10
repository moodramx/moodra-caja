// Piezas del punto de venta: foto del producto, calculadora de cambio y la
// nota de costo para el contador.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Chip } from '../../design/Chip'
import { cx } from '../../design/cx'
import type { InventoryRow, SaleLine } from '../../lib/events'
import { changeDue, costOfExit, suggestedPayments, type StockState } from '../../lib/merch'
import { entryToCents, formatMXN, formatMXNShort } from '../../lib/money'
import { uploadProductPhoto, usePhoto } from '../../lib/photos'
import { fieldClass } from '../captura/parts'

export interface Product {
  id: string
  name: string
  emoji: string
  photoPath: string | null
  variants: (InventoryRow & { stock: number })[]
}

const money = (cents: bigint) => formatMXNShort(cents)

/** Foto del producto si la tiene (también sin señal); si no, su emoji. */
export function ProductImage({
  product,
  className = '',
}: {
  product: Product
  className?: string
}) {
  const url = usePhoto(product.photoPath)
  if (!url) {
    return (
      <span aria-hidden="true" className="text-4xl">
        {product.emoji}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt={`Foto de ${product.name}`}
      className={cx('aspect-[4/3] w-full rounded-control object-cover', className)}
    />
  )
}

/** Ponerle o cambiarle la foto a cada producto. Cualquiera de la banda puede. */
export function PhotosTool({ products }: { products: Product[] }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (productId: string, file: File | undefined) => {
    if (!file) return
    setBusy(productId)
    setError(null)
    try {
      await uploadProductPhoto(productId, file)
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo subir la foto.')
    } finally {
      setBusy(null)
    }
  }

  if (products.length === 0) return <p className="text-ink-muted">Todavía no hay productos.</p>
  return (
    <div className="space-y-3">
      <p className="text-ink-muted">Toma una foto o elige una de tu galería. Necesitas internet.</p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line">
        {products.map((product) => (
          <li key={product.id} className="flex items-center gap-3 py-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-2">
              <ProductImage product={product} className="aspect-square h-full" />
            </div>
            <span className="min-w-0 flex-1 font-semibold">{product.name}</span>
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded-full border border-line bg-surface-2 px-4 font-semibold active:bg-line">
              {busy === product.id
                ? 'Subiendo…'
                : product.photoPath
                  ? 'Cambiar foto'
                  : '📷 Poner foto'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label={`Foto de ${product.name}`}
                disabled={busy !== null}
                onChange={(event) => {
                  void upload(product.id, event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** ¿Con cuánto te pagan? → cuánto cambio devolver. No se guarda: es solo ayuda. */
export function ChangeCalculator({ total }: { total: bigint }) {
  const [paid, setPaid] = useState('')
  const paidCents = /^\d+(\.\d{0,2})?$/.test(paid) ? entryToCents(paid) : null
  const change = paidCents === null ? null : changeDue(total, paidCents)

  return (
    <section
      aria-label="Calculadora de cambio"
      className="space-y-3 rounded-card border border-line bg-bg p-4"
    >
      <label className="block space-y-2">
        <span className="font-semibold">¿Con cuánto te pagan?</span>
        <input
          className={`${fieldClass} display text-3xl tabular-nums`}
          inputMode="decimal"
          value={paid}
          placeholder="$"
          onChange={(event) => setPaid(event.target.value.replace(/[^\d.]/g, ''))}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {suggestedPayments(total).map((amount) => (
          <Chip
            key={amount.toString()}
            selected={paidCents === amount}
            onClick={() => setPaid((Number(amount) / 100).toString())}
          >
            {amount === total ? 'Exacto' : money(amount)}
          </Chip>
        ))}
      </div>
      {change !== null && (
        <div role="status" aria-label="Cambio">
          {change > 0n ? (
            <>
              <p className="text-ink-muted">Dale de cambio</p>
              <p className="display text-5xl text-in tabular-nums">{money(change)}</p>
            </>
          ) : change === 0n ? (
            <p className="text-xl font-semibold">Pago exacto, sin cambio.</p>
          ) : (
            <>
              <p className="text-ink-muted">Todavía faltan</p>
              <p className="display text-5xl text-danger tabular-nums">{money(-change)}</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** Solo contador: a qué costo salen las piezas de esta venta. */
export function CostNote({
  cart,
  products,
  total,
}: {
  cart: SaleLine[]
  products: Product[]
  total: bigint
}) {
  const states = new Map<string, StockState>()
  let soldCost = 0n
  let giftCost = 0n
  for (const line of cart) {
    const variant = products
      .flatMap((p) => p.variants)
      .find((v) => v.variant_id === line.variant_id)
    if (!variant) continue
    const state = states.get(line.variant_id) ?? {
      stock: variant.stock_qty ?? 0,
      valueCents: BigInt(variant.stock_value_cents ?? 0),
      avgCostCents: BigInt(variant.avg_cost_cents ?? 0),
    }
    const cost = costOfExit(state, line.qty)
    states.set(line.variant_id, {
      ...state,
      stock: state.stock - line.qty,
      valueCents: state.valueCents - cost,
    })
    if (line.is_gift) giftCost += cost
    else soldCost += cost
  }
  return (
    <p className="rounded-card bg-surface-2 p-3 text-sm tabular-nums">
      <strong>Para el contador.</strong> Costo de lo vendido: {formatMXN(soldCost)}
      {giftCost > 0n && <> · costo de lo regalado: {formatMXN(giftCost)}</>} · queda de la venta:{' '}
      {formatMXN(total - soldCost)}. Las piezas salen a su costo promedio.
    </p>
  )
}

/** Contador de piezas: − cantidad +. Los botones miden 48 px. */
export function Stepper({
  count,
  name,
  onMinus,
  onPlus,
}: {
  count: number
  name: string
  onMinus: () => void
  onPlus: () => void
}) {
  const button =
    'grid size-12 shrink-0 place-items-center rounded-full border border-line bg-bg text-2xl leading-none select-none active:bg-surface-2 disabled:opacity-35'
  return (
    <div className="flex items-center justify-between gap-1">
      <button
        type="button"
        aria-label={`Una menos de ${name}`}
        disabled={count === 0}
        onClick={onMinus}
        className={button}
      >
        −
      </button>
      <span
        aria-label={`${count} de ${name} en la cuenta`}
        className={cx(
          'min-w-8 text-center text-xl font-bold tabular-nums',
          count === 0 && 'text-ink-faint',
        )}
      >
        {count}
      </span>
      <button type="button" aria-label={`Una más de ${name}`} onClick={onPlus} className={button}>
        +
      </button>
    </div>
  )
}
