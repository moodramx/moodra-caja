import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { EntregaPayload } from '../../lib/events'
import { describeEntrega } from '../../lib/humanize'
import { entryToCents } from '../../lib/money'
import { useProfiles } from '../../lib/queries'
import { useCaptureProject } from '../proyectos/Proyectos'
import { AmountStep, Confirm, Option, Step, useCapture } from './parts'

type StepName = 'monto' | 'destino' | 'confirmar'
type Target =
  { to_kind: 'integrante'; to_member: string; name: string } | { to_kind: 'caja' | 'banco' }

/** Pasé efectivo: monto → a quién → confirmar. Cuenta cuando el otro confirma. */
export function PaseFlow({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth()
  const profiles = useProfiles()
  const captureProject = useCaptureProject()
  const capture = useCapture()

  const [step, setStep] = useState<StepName>('monto')
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState<Target | null>(null)

  const others = (profiles.data ?? []).filter((p) => p.activo && p.id !== profile?.id)
  const choose = (next: Target) => {
    setTarget(next)
    setStep('confirmar')
  }

  if (step === 'monto') {
    return (
      <Step question="¿Cuánto efectivo pasaste?">
        <AmountStep value={amount} onChange={setAmount} onNext={() => setStep('destino')} />
      </Step>
    )
  }

  if (step === 'destino') {
    return (
      <Step question="¿A quién se lo pasaste?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          {others.map((p) => (
            <Option
              key={p.id}
              emoji={p.emoji}
              label={p.display_name}
              onClick={() =>
                choose({ to_kind: 'integrante', to_member: p.id, name: p.display_name })
              }
            />
          ))}
          <Option
            emoji="🧰"
            label="A la caja de la banda"
            hint="El efectivo que guarda Diego"
            onClick={() => choose({ to_kind: 'caja' })}
          />
          <Option
            emoji="🏦"
            label="Lo deposité en la cuenta de la banda"
            onClick={() => choose({ to_kind: 'banco' })}
          />
        </div>
      </Step>
    )
  }

  if (!target) return null
  const payload: EntregaPayload = {
    amount_cents: Number(entryToCents(amount)),
    to_kind: target.to_kind,
    to_member: target.to_kind === 'integrante' ? target.to_member : undefined,
    project_id: captureProject.projectId,
    show_id: captureProject.showId,
  }
  const needsDiego = target.to_kind !== 'integrante' && profile?.role !== 'contador'

  return (
    <Step question="¿Así quedó?" onBack={() => setStep('destino')}>
      <Confirm
        text={
          describeEntrega(payload, target.to_kind === 'integrante' ? target.name : undefined) +
          (needsDiego ? ' Cuenta en cuanto Diego lo confirme.' : '')
        }
        onSave={() => {
          void capture('entrega_efectivo', payload)
          onDone()
        }}
      />
    </Step>
  )
}
