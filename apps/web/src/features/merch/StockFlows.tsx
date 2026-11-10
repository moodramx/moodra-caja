// Movimientos de existencias fuera de la venta: entró merch (compra o saldo
// inicial), regalé, se dañó, conté. Antes de guardar se muestra la cuenta
// completa: piezas, costo y cómo queda el costo promedio.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../design/Button'
import { useAuth } from '../../lib/auth'
import type {
  AjustePayload,
  CompraPayload,
  PaidWith,
  SalidaPayload,
  SettlementPref,
} from '../../lib/events'
import { PAID_WITH_OPTIONS, SETTLEMENT_OPTIONS } from '../../lib/humanize'
import { costOfExit, previewEntry, type StockState } from '../../lib/merch'
import { entryToCents, formatMXN } from '../../lib/money'
import { useActiveProject } from '../../lib/queries'
import { AmountStep, Confirm, fieldClass, Option, Step, useCapture } from '../captura/parts'
import type { Product } from './MerchParts'

type Variant = Product['variants'][number]
export interface Picked {
  variant: Variant
  name: string
}

const money = (cents: bigint | number) => formatMXN(BigInt(cents))
const pzas = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`

/** Existencias según el servidor (sin lo pendiente de sincronizar). */
const stateOf = (variant: Variant): StockState => ({
  stock: variant.stock_qty ?? 0,
  valueCents: BigInt(variant.stock_value_cents ?? 0),
  avgCostCents: BigInt(variant.avg_cost_cents ?? 0),
})

/** Renglones de "la cuenta": etiqueta a la izquierda, número a la derecha. */
function Cuenta({ rows, note }: { rows: [string, string][]; note?: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-bg p-4">
      <dl className="space-y-1.5 tabular-nums">
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={`flex items-baseline justify-between gap-3 ${index === rows.length - 1 ? 'border-t border-line pt-2 font-semibold' : ''}`}
          >
            <dt className={index === rows.length - 1 ? '' : 'text-ink-muted'}>{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-sm text-ink-muted">{note}</p>}
    </div>
  )
}

/** Elegir producto y, si tiene varias, la variante. */
function PickVariant({
  products,
  onPick,
}: {
  products: Product[]
  onPick: (picked: Picked) => void
}) {
  const [product, setProduct] = useState<Product | null>(null)

  if (products.length === 0) {
    return <p className="text-ink-muted">Todavía no hay productos dados de alta.</p>
  }
  if (!product) {
    return (
      <div className="space-y-2">
        {products.map((p) => (
          <Option
            key={p.id}
            emoji={p.emoji}
            label={p.name}
            hint={
              p.variants.length > 1
                ? `${p.variants.length} opciones`
                : `Hay ${p.variants[0]?.stock ?? 0}`
            }
            onClick={() =>
              p.variants.length === 1
                ? onPick({ variant: p.variants[0]!, name: p.name })
                : setProduct(p)
            }
          />
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {product.variants.map((variant) => (
        <Option
          key={variant.variant_id}
          emoji={product.emoji}
          label={variant.label ?? ''}
          hint={`Hay ${variant.stock}`}
          onClick={() => onPick({ variant, name: `${product.name} · ${variant.label}` })}
        />
      ))}
      <Button variant="ghost" block onClick={() => setProduct(null)}>
        Otro producto
      </Button>
    </div>
  )
}

/** Cantidad con botones grandes y campo numérico. */
function Qty({
  value,
  onChange,
  min = 1,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        aria-label="Menos"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-14 place-items-center rounded-full border border-line text-3xl active:bg-surface-2"
      >
        −
      </button>
      <input
        aria-label="Cantidad"
        inputMode="numeric"
        className={`${fieldClass} display w-28 text-center text-4xl tabular-nums`}
        value={value}
        onChange={(event) =>
          onChange(Math.max(min, Number(event.target.value.replace(/\D/g, '')) || min))
        }
      />
      <button
        type="button"
        aria-label="Más"
        onClick={() => onChange(value + 1)}
        className="grid size-14 place-items-center rounded-full border border-line text-3xl active:bg-surface-2"
      >
        +
      </button>
    </div>
  )
}

type CompraStep = 'que' | 'origen' | 'cuantas' | 'costo' | 'pago' | 'acuerdo' | 'confirmar'

/**
 * Entró merch: qué → (compra nueva o saldo inicial) → cuántas piezas → costo
 * por pieza → con qué se pagó → la cuenta completa → guardar.
 */
export function CompraFlow({
  products,
  initial,
  onDone,
}: {
  products: Product[]
  initial?: Picked
  onDone: () => void
}) {
  const { profile } = useAuth()
  const context = useActiveProject()
  const capture = useCapture()
  const isContador = profile?.role === 'contador'
  const afterPick: CompraStep = isContador ? 'origen' : 'cuantas'

  const [step, setStep] = useState<CompraStep>(initial ? afterPick : 'que')
  const [picked, setPicked] = useState<Picked | null>(initial ?? null)
  const [opening, setOpening] = useState(false)
  const [qty, setQtyValue] = useState(1)
  const [cost, setCost] = useState('')
  const [paidWith, setPaidWith] = useState<PaidWith | null>(null)
  const [pref, setPref] = useState<SettlementPref | undefined>()

  if (step === 'que') {
    return (
      <Step question="¿Qué entró?">
        <PickVariant
          products={products}
          onPick={(next) => {
            setPicked(next)
            setStep(afterPick)
          }}
        />
      </Step>
    )
  }
  if (step === 'origen') {
    const choose = (isOpening: boolean) => {
      setOpening(isOpening)
      setStep('cuantas')
    }
    return (
      <Step question="¿De dónde salieron?" onBack={initial ? undefined : () => setStep('que')}>
        <div className="space-y-2">
          <Option
            emoji="🛒"
            label="Es una compra nueva"
            hint="Se pagó ahora; te pregunto con qué"
            onClick={() => choose(false)}
          />
          <Option
            emoji="📦"
            label="Ya las teníamos (saldo inicial)"
            hint="Lo que había antes de usar la app; no sale dinero"
            onClick={() => choose(true)}
          />
        </div>
      </Step>
    )
  }
  if (step === 'cuantas') {
    return (
      <Step
        question={`¿Cuántas piezas de ${picked?.name}?`}
        onBack={() => setStep(afterPick === 'origen' ? 'origen' : 'que')}
      >
        <p className="text-ink-muted">Hoy hay {picked?.variant.stock_qty ?? 0} en el inventario.</p>
        <Qty value={qty} onChange={setQtyValue} />
        <Button size="lg" block onClick={() => setStep('costo')}>
          Continuar
        </Button>
      </Step>
    )
  }
  if (step === 'costo') {
    return (
      <Step
        question={opening ? '¿Cuánto les costó cada pieza?' : '¿Cuánto costó cada pieza?'}
        onBack={() => setStep('cuantas')}
      >
        <p className="text-ink-muted">
          Costo por pieza, no el total. Si no lo sabes exacto, pon tu mejor estimado.
        </p>
        <AmountStep
          value={cost}
          onChange={setCost}
          onNext={() => setStep(opening ? 'confirmar' : 'pago')}
        />
      </Step>
    )
  }
  if (step === 'pago') {
    const options = [
      ...PAID_WITH_OPTIONS,
      ...(isContador ? [{ value: 'caja', emoji: '🧰', label: 'Dinero de la caja' } as const] : []),
    ]
    return (
      <Step question="¿Con qué se pagó?" onBack={() => setStep('costo')}>
        <div className="space-y-2">
          {options.map((option) => (
            <Option
              key={option.value}
              emoji={option.emoji}
              label={option.label}
              onClick={() => {
                setPaidWith(option.value)
                setStep(option.value === 'mi_dinero' ? 'acuerdo' : 'confirmar')
              }}
            />
          ))}
        </div>
      </Step>
    )
  }
  if (step === 'acuerdo') {
    return (
      <Step question="Pusiste de tu dinero. ¿Qué hacemos?" onBack={() => setStep('pago')}>
        <div className="space-y-2">
          {SETTLEMENT_OPTIONS.map((option) => (
            <Option
              key={option.value}
              emoji={option.emoji}
              label={option.label}
              onClick={() => {
                setPref(option.value)
                setStep('confirmar')
              }}
            />
          ))}
        </div>
      </Step>
    )
  }

  if (!picked || (!opening && !paidWith)) return null
  const unit = entryToCents(cost)
  const before = stateOf(picked.variant)
  const after = previewEntry(before, qty, unit)
  const payload: CompraPayload = {
    lines: [{ variant_id: picked.variant.variant_id!, qty, unit_cost_cents: Number(unit) }],
    ...(opening
      ? { opening: true }
      : { paid_with: paidWith!, settlement_pref: paidWith === 'mi_dinero' ? pref : undefined }),
    project_id: context.id,
    show_id: context.showId,
  }
  const how = opening
    ? 'No sale dinero: es lo que la banda ya tenía.'
    : `Se pagó con: ${(PAID_WITH_OPTIONS.find((o) => o.value === paidWith)?.label ?? 'dinero de la caja').toLowerCase()}.`

  return (
    <Step question="Revisa la cuenta" onBack={() => setStep(opening ? 'costo' : 'pago')}>
      <p className="font-semibold">{picked.name}</p>
      <Cuenta
        rows={[
          ['Había', `${pzas(before.stock)} · ${money(before.valueCents)}`],
          [`Entran ${pzas(qty)} × ${money(unit)}`, money(BigInt(qty) * unit)],
          ['Quedan', `${pzas(after.stock)} · ${money(after.valueCents)}`],
        ]}
        note={
          <>
            Costo promedio por pieza: antes {money(before.avgCostCents)}, ahora{' '}
            <strong className="text-ink">{money(after.avgCostCents)}</strong>. Con ese costo saldrá
            cada pieza que se venda, se regale o se dé de baja.
          </>
        }
      />
      <Confirm
        text={`${opening ? 'Saldo inicial' : 'Compra'}: ${pzas(qty)} por ${money(BigInt(qty) * unit)}. ${how}`}
        onSave={() => {
          void capture('compra_merch', payload)
          onDone()
        }}
      />
    </Step>
  )
}

/** Regalé (cualquiera) o se dañó/perdió (contador): qué → cuántas → confirmar. */
export function SalidaFlow({
  kind,
  products,
  onDone,
}: {
  kind: 'regalo' | 'merma'
  products: Product[]
  onDone: () => void
}) {
  const { profile } = useAuth()
  const context = useActiveProject()
  const capture = useCapture()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [qty, setQtyValue] = useState(1)
  const [note, setNote] = useState('')

  if (!picked) {
    return (
      <Step question={kind === 'regalo' ? '¿Qué regalaste?' : '¿Qué se dañó o se perdió?'}>
        <PickVariant products={products} onPick={setPicked} />
      </Step>
    )
  }
  const payload: SalidaPayload = {
    kind,
    variant_id: picked.variant.variant_id!,
    qty,
    note: note.trim() || undefined,
    project_id: context.id,
    show_id: context.showId,
  }
  const before = stateOf(picked.variant)
  const cost = costOfExit(before, qty)
  return (
    <Step question={`¿Cuántas de ${picked.name}?`} onBack={() => setPicked(null)}>
      <Qty value={qty} onChange={setQtyValue} />
      {profile?.role === 'contador' && (
        <Cuenta
          rows={[
            ['Hay', `${pzas(before.stock)} · ${money(before.valueCents)}`],
            [`Salen ${pzas(qty)} a costo promedio`, money(cost)],
            ['Quedan', `${pzas(before.stock - qty)} · ${money(before.valueCents - cost)}`],
          ]}
          note={
            kind === 'regalo'
              ? 'Ese costo se registra como merch regalado; no hay ingreso.'
              : 'Ese costo se registra como merma.'
          }
        />
      )}
      <Confirm
        text={
          kind === 'regalo'
            ? `Regalaste ${pzas(qty)} de ${picked.name}.`
            : `Se dan de baja ${pzas(qty)} de ${picked.name}.`
        }
        onSave={() => {
          void capture('salida_merch', payload)
          onDone()
        }}
      >
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">
            {kind === 'regalo' ? '¿A quién? (opcional)' : '¿Qué pasó? (opcional)'}
          </span>
          <input
            className={fieldClass}
            value={note}
            maxLength={120}
            placeholder={kind === 'regalo' ? 'Ej. prensa, el venue' : 'Ej. se manchó'}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </Confirm>
    </Step>
  )
}

/** Conteo físico (contador): qué → cuántas hay de verdad → confirmar la diferencia. */
export function ConteoFlow({
  products,
  initial,
  onDone,
}: {
  products: Product[]
  initial?: Picked
  onDone: () => void
}) {
  const capture = useCapture()
  const [picked, setPicked] = useState<Picked | null>(initial ?? null)
  const [counted, setCounted] = useState(Math.max(0, initial?.variant.stock_qty ?? 0))

  if (!picked) {
    return (
      <Step question="¿Qué contaste?">
        <PickVariant
          products={products}
          onPick={(next) => {
            setPicked(next)
            setCounted(Math.max(0, next.variant.stock_qty ?? 0))
          }}
        />
      </Step>
    )
  }
  const before = stateOf(picked.variant)
  const diff = counted - before.stock
  const cost = diff > 0 ? BigInt(diff) * before.avgCostCents : costOfExit(before, -diff)
  const payload: AjustePayload = { variant_id: picked.variant.variant_id!, counted_qty: counted }
  return (
    <Step
      question={`¿Cuántas hay de ${picked.name}?`}
      onBack={initial ? undefined : () => setPicked(null)}
    >
      <p className="text-ink-muted">
        La app dice que hay {before.stock}. Pon las que contaste de verdad.
      </p>
      <Qty value={counted} onChange={setCounted} min={0} />
      {diff === 0 ? (
        <p className="rounded-card border border-line bg-bg p-4 text-lg">
          Coincide. No hay nada que corregir.
        </p>
      ) : (
        <>
          <Cuenta
            rows={[
              ['La app decía', pzas(before.stock)],
              [
                diff > 0 ? `Sobran ${pzas(diff)}` : `Faltan ${pzas(-diff)}`,
                `${diff > 0 ? '+' : '−'}${money(cost)}`,
              ],
              [
                'Queda',
                `${pzas(counted)} · ${money(before.valueCents + (diff > 0 ? cost : -cost))}`,
              ],
            ]}
            note={
              diff > 0
                ? `Las que sobran entran al costo promedio actual (${money(before.avgCostCents)}).`
                : 'Las que faltan salen a costo promedio y se registran como merma.'
            }
          />
          <Confirm
            text={
              diff > 0
                ? `Hay ${pzas(diff)} de más. Se suman al inventario.`
                : `Faltan ${pzas(-diff)}. Se dan de baja del inventario.`
            }
            onSave={() => {
              void capture('ajuste_inventario', payload)
              onDone()
            }}
          />
        </>
      )}
    </Step>
  )
}
