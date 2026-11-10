// Movimientos de existencias fuera de la venta: entró merch, regalé, se dañó, conté.
import { useState } from 'react'
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
import { entryToCents, formatMXNShort } from '../../lib/money'
import { useActiveProject } from '../../lib/queries'
import { AmountStep, Confirm, fieldClass, Option, Step, useCapture } from '../captura/parts'
import type { Product } from './MerchPage'

type Variant = Product['variants'][number]
interface Picked {
  variant: Variant
  name: string
}

const money = (cents: bigint | number) => formatMXNShort(BigInt(cents))
const pzas = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`

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

/** Entró merch: qué → cuántas → costo por pieza → con qué se pagó → confirmar. */
export function CompraFlow({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const { profile } = useAuth()
  const context = useActiveProject()
  const capture = useCapture()
  const [step, setStep] = useState<'que' | 'cuantas' | 'costo' | 'pago' | 'acuerdo' | 'confirmar'>(
    'que',
  )
  const [picked, setPicked] = useState<Picked | null>(null)
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
            setStep('cuantas')
          }}
        />
      </Step>
    )
  }
  if (step === 'cuantas') {
    return (
      <Step question={`¿Cuántas de ${picked?.name}?`} onBack={() => setStep('que')}>
        <Qty value={qty} onChange={setQtyValue} />
        <Button size="lg" block onClick={() => setStep('costo')}>
          Continuar
        </Button>
      </Step>
    )
  }
  if (step === 'costo') {
    return (
      <Step question="¿Cuánto costó cada pieza?" onBack={() => setStep('cuantas')}>
        <AmountStep value={cost} onChange={setCost} onNext={() => setStep('pago')} />
      </Step>
    )
  }
  if (step === 'pago') {
    const options = [
      ...PAID_WITH_OPTIONS,
      ...(profile?.role === 'contador'
        ? [{ value: 'caja', emoji: '🧰', label: 'Dinero de la caja' } as const]
        : []),
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

  if (!picked || !paidWith) return null
  const unit = Number(entryToCents(cost))
  const payload: CompraPayload = {
    lines: [{ variant_id: picked.variant.variant_id!, qty, unit_cost_cents: unit }],
    paid_with: paidWith,
    settlement_pref: paidWith === 'mi_dinero' ? pref : undefined,
    project_id: context.id,
  }
  const how = PAID_WITH_OPTIONS.find((o) => o.value === paidWith)?.label ?? 'dinero de la caja'
  return (
    <Step question="¿Así quedó?" onBack={() => setStep('pago')}>
      <Confirm
        text={`Entraron ${pzas(qty)} de ${picked.name} a ${money(unit)} cada una: ${money(unit * qty)} en total. Se pagó con: ${how.toLowerCase()}.`}
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
  }
  return (
    <Step question={`¿Cuántas de ${picked.name}?`} onBack={() => setPicked(null)}>
      <Qty value={qty} onChange={setQtyValue} />
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
export function ConteoFlow({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const capture = useCapture()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [counted, setCounted] = useState(0)

  if (!picked) {
    return (
      <Step question="¿Qué contaste?">
        <PickVariant
          products={products}
          onPick={(next) => {
            setPicked(next)
            setCounted(Math.max(0, next.variant.stock))
          }}
        />
      </Step>
    )
  }
  const diff = counted - picked.variant.stock
  const payload: AjustePayload = { variant_id: picked.variant.variant_id!, counted_qty: counted }
  return (
    <Step question={`¿Cuántas hay de ${picked.name}?`} onBack={() => setPicked(null)}>
      <p className="text-ink-muted">La app dice que hay {picked.variant.stock}.</p>
      <Qty value={counted} onChange={setCounted} min={0} />
      {diff === 0 ? (
        <p className="rounded-card border border-line bg-bg p-4 text-lg">
          Coincide. No hay nada que corregir.
        </p>
      ) : (
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
      )}
    </Step>
  )
}
