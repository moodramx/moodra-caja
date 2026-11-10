import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { PuseDineroPayload } from '../../lib/events'
import { describePuse } from '../../lib/humanize'
import { entryToCents } from '../../lib/money'
import { useProfiles } from '../../lib/queries'
import { useCaptureProject } from '../proyectos/Proyectos'
import { AmountStep, Confirm, Option, Step, useCapture } from './parts'

type StepName = 'monto' | 'destino' | 'quien' | 'tipo' | 'confirmar'

/** Puse dinero: monto → a dónde → ¿se te regresa? → confirmar. */
export function PuseFlow({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth()
  const profiles = useProfiles()
  const target = useCaptureProject()
  const capture = useCapture()

  const [step, setStep] = useState<StepName>('monto')
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState<PuseDineroPayload['destination'] | null>(null)
  const [holder, setHolder] = useState<{ id: string; name: string } | null>(null)
  const [kind, setKind] = useState<PuseDineroPayload['kind'] | null>(null)

  const others = (profiles.data ?? []).filter((p) => p.activo && p.id !== profile?.id)

  if (step === 'monto') {
    return (
      <Step question="¿Cuánto pusiste?">
        <AmountStep value={amount} onChange={setAmount} onNext={() => setStep('destino')} />
      </Step>
    )
  }

  if (step === 'destino') {
    const go = (next: PuseDineroPayload['destination']) => {
      setDestination(next)
      setHolder(null)
      setStep(next === 'efectivo_integrante' ? 'quien' : 'tipo')
    }
    return (
      <Step question="¿A dónde fue?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          <Option emoji="🏦" label="A la cuenta de la banda" onClick={() => go('cuenta_banda')} />
          <Option emoji="🧰" label="A la caja de la banda" onClick={() => go('caja')} />
          <Option
            emoji="🤝"
            label="Se lo di en efectivo a alguien"
            onClick={() => go('efectivo_integrante')}
          />
        </div>
      </Step>
    )
  }

  if (step === 'quien') {
    return (
      <Step question="¿A quién se lo diste?" onBack={() => setStep('destino')}>
        <div className="space-y-2">
          {others.map((p) => (
            <Option
              key={p.id}
              emoji={p.emoji}
              label={p.display_name}
              onClick={() => {
                setHolder({ id: p.id, name: p.display_name })
                setStep('tipo')
              }}
            />
          ))}
        </div>
      </Step>
    )
  }

  if (step === 'tipo') {
    const go = (next: PuseDineroPayload['kind']) => {
      setKind(next)
      setStep('confirmar')
    }
    return (
      <Step
        question="¿Se te regresa?"
        onBack={() => setStep(destination === 'efectivo_integrante' ? 'quien' : 'destino')}
      >
        <div className="space-y-2">
          <Option
            emoji="↩️"
            label="Sí, regrésenmelo"
            hint="Queda como dinero que te debemos"
            onClick={() => go('prestamo')}
          />
          <Option
            emoji="🎁"
            label="No, es aportación"
            hint="Lo pones para la banda"
            onClick={() => go('aportacion')}
          />
        </div>
      </Step>
    )
  }

  if (!destination || !kind) return null
  const payload: PuseDineroPayload = {
    amount_cents: Number(entryToCents(amount)),
    destination,
    holder_member_id: holder?.id,
    kind,
    project_id: target.projectId,
    show_id: target.showId,
  }

  return (
    <Step question="¿Así quedó?" onBack={() => setStep('tipo')}>
      <Confirm
        text={describePuse(payload, holder?.name)}
        onSave={() => {
          void capture('puse_dinero', payload)
          onDone()
        }}
      />
    </Step>
  )
}
