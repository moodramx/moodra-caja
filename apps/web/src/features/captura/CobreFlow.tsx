import { useState } from 'react'
import type { Category, IngresoPayload, MoneyPlace } from '../../lib/events'
import { describeIngreso, INCOME_PLACE_OPTIONS } from '../../lib/humanize'
import { entryToCents } from '../../lib/money'
import { useActiveProject, useCategories } from '../../lib/queries'
import { AmountStep, Confirm, Option, Step, useCapture } from './parts'

type StepName = 'tipo' | 'monto' | 'destino' | 'confirmar'

/** Cobré: de qué fue → monto → dónde quedó → confirmar. */
export function CobreFlow({ onDone }: { onDone: () => void }) {
  const categories = useCategories()
  const context = useActiveProject()
  const capture = useCapture()

  const [step, setStep] = useState<StepName>('tipo')
  const [category, setCategory] = useState<Category | null>(null)
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState<MoneyPlace | null>(null)

  const kinds = (categories.data ?? []).filter((c) => c.kind === 'ingreso')

  if (step === 'tipo') {
    return (
      <Step question="¿De qué fue?">
        {categories.isPending && <p className="text-ink-muted">Afinando…</p>}
        <div className="space-y-2">
          {kinds.map((c) => (
            <Option
              key={c.id}
              emoji={c.emoji}
              label={c.name}
              onClick={() => {
                setCategory(c)
                setStep('monto')
              }}
            />
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          El pago de un show y la venta de merch tendrán su propio botón muy pronto.
        </p>
      </Step>
    )
  }

  if (step === 'monto') {
    return (
      <Step question="¿Cuánto cobraste?" onBack={() => setStep('tipo')}>
        <AmountStep value={amount} onChange={setAmount} onNext={() => setStep('destino')} />
      </Step>
    )
  }

  if (step === 'destino') {
    return (
      <Step question="¿Dónde quedó el dinero?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          {INCOME_PLACE_OPTIONS.map((option) => (
            <Option
              key={option.value}
              emoji={option.emoji}
              label={option.label}
              onClick={() => {
                setDestination(option.value)
                setStep('confirmar')
              }}
            />
          ))}
        </div>
      </Step>
    )
  }

  if (!category || !destination) return null
  const payload: IngresoPayload = {
    amount_cents: Number(entryToCents(amount)),
    category_id: category.id,
    destination,
    project_id: context.id,
  }

  return (
    <Step question="¿Así quedó?" onBack={() => setStep('destino')}>
      <Confirm
        text={describeIngreso(payload, category)}
        onSave={() => {
          void capture('ingreso', payload)
          onDone()
        }}
      />
    </Step>
  )
}
