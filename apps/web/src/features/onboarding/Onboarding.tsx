// Primeros pasos: tres pantallas la primera vez que alguien entra en este
// dispositivo, y disponibles siempre desde Más → "Cómo se usa".
import { useState } from 'react'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { markOnboardingSeen } from './seen'

const STEPS = [
  {
    emoji: '💸',
    title: 'Registra en el momento',
    body: 'Gastaste, cobraste o vendiste merch: toca el botón en Inicio, pon el monto y listo. Son 10 segundos y nadie tiene que acordarse después.',
  },
  {
    emoji: '📶',
    title: 'Funciona sin señal',
    body: 'En el foro o en carretera puedes registrar igual. Se guarda en tu celular y se manda solo cuando vuelve la señal.',
  },
  {
    emoji: '🤝',
    title: 'Las cuentas, siempre claras',
    body: 'En Inicio ves cuánto dinero de la banda traes y cuánto te debemos. Si le pasas efectivo a alguien, esa persona lo confirma. Si te equivocas, toca "Deshacer" o anúlalo en Movimientos.',
  },
] as const

export function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]!
  const last = step === STEPS.length - 1

  const finish = () => {
    markOnboardingSeen()
    setStep(0)
    onClose()
  }

  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && finish()} title="Cómo se usa">
      <div className="space-y-5 text-center">
        <p aria-hidden="true" className="text-6xl">
          {current.emoji}
        </p>
        <div>
          <p className="display text-2xl">{current.title}</p>
          <p className="mt-2 text-ink-muted">{current.body}</p>
        </div>
        <p className="label-mono text-ink-muted" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
          {step + 1} / {STEPS.length}
        </p>
        <div className="space-y-2">
          <Button size="lg" block onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? 'Empezar' : 'Siguiente'}
          </Button>
          {!last && (
            <Button variant="ghost" block onClick={finish}>
              Saltar
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
