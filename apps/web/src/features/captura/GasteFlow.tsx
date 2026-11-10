import { useState } from 'react'
import { Chip } from '../../design/Chip'
import { useAuth } from '../../lib/auth'
import type { Category, GastoPayload, PaidWith, SettlementPref } from '../../lib/events'
import { describeGasto, PAID_WITH_OPTIONS, SETTLEMENT_OPTIONS } from '../../lib/humanize'
import { entryToCents } from '../../lib/money'
import { useCategories } from '../../lib/queries'
import { ProjectPicker, useCaptureProject } from '../proyectos/Proyectos'
import { AmountStep, Confirm, fieldClass, Option, Step, useCapture } from './parts'

type StepName = 'monto' | 'categoria' | 'pago' | 'acuerdo' | 'confirmar'

/** Gasté: monto → categoría → con qué pagaste → (qué hacemos) → confirmar. */
export function GasteFlow({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth()
  const categories = useCategories()
  const target = useCaptureProject()
  const capture = useCapture()

  const [step, setStep] = useState<StepName>('monto')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [showExtras, setShowExtras] = useState(false)
  const [paidWith, setPaidWith] = useState<PaidWith | null>(null)
  const [pref, setPref] = useState<SettlementPref | undefined>()
  const [description, setDescription] = useState('')

  const isContador = profile?.role === 'contador'
  const gasto = (categories.data ?? []).filter(
    (c) => c.kind === 'gasto' && (c.visible_to === 'todos' || isContador),
  )
  const main = gasto.filter((c) => !c.is_extra)
  const extras = gasto.filter((c) => c.is_extra)

  const payload: GastoPayload | null =
    category && paidWith
      ? {
          amount_cents: Number(entryToCents(amount)),
          category_id: category.id,
          paid_with: paidWith,
          settlement_pref: paidWith === 'mi_dinero' ? pref : undefined,
          project_id: target.projectId,
          show_id: target.showId,
          description: description.trim() || undefined,
        }
      : null

  if (step === 'monto') {
    return (
      <Step question="¿Cuánto gastaste?">
        <AmountStep value={amount} onChange={setAmount} onNext={() => setStep('categoria')} />
      </Step>
    )
  }

  if (step === 'categoria') {
    return (
      <Step question="¿En qué?" onBack={() => setStep('monto')}>
        {categories.isPending && <p className="text-ink-muted">Afinando…</p>}
        {categories.data && gasto.length === 0 && (
          <p className="text-ink-muted">Conéctate a internet una vez para bajar las categorías.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {[...main, ...(showExtras ? extras : [])].map((c) => (
            <Chip
              key={c.id}
              emoji={c.emoji}
              selected={category?.id === c.id}
              onClick={() => {
                setCategory(c)
                setStep('pago')
              }}
            >
              {c.name}
            </Chip>
          ))}
          {!showExtras && extras.length > 0 && (
            <Chip emoji="➕" onClick={() => setShowExtras(true)}>
              Más
            </Chip>
          )}
        </div>
      </Step>
    )
  }

  if (step === 'pago') {
    const options = [
      ...PAID_WITH_OPTIONS,
      ...(isContador ? [{ value: 'caja', emoji: '🧰', label: 'Dinero de la caja' } as const] : []),
    ]
    return (
      <Step question="¿Con qué pagaste?" onBack={() => setStep('categoria')}>
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

  return (
    <Step
      question="¿Así quedó?"
      onBack={() => setStep(paidWith === 'mi_dinero' ? 'acuerdo' : 'pago')}
    >
      {payload && category && (
        <Confirm
          text={describeGasto(payload, category, target.project?.name)}
          onSave={() => {
            void capture('gasto', payload)
            onDone()
          }}
        >
          <ProjectPicker project={target.project} onChange={target.setProjectId} />
          <label className="block space-y-2">
            <span className="text-sm text-ink-muted">Nota (opcional)</span>
            <input
              className={fieldClass}
              value={description}
              maxLength={120}
              placeholder="Ej. gasolina de ida"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </Confirm>
      )}
    </Step>
  )
}
