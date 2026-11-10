import type { ReactNode } from 'react'
import { AmountKeypad } from '../../design/AmountKeypad'
import { Button } from '../../design/Button'
import { cx } from '../../design/cx'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type { EventType, SubmitPayload } from '../../lib/events'
import { entryToCents } from '../../lib/money'
import { engine } from '../../lib/offline/runtime'

/** Pregunta del paso + botón para regresar. */
export function Step({
  question,
  onBack,
  children,
}: {
  question: string
  onBack?: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-12 items-center gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Atrás"
            className="-ml-3 grid size-12 shrink-0 place-items-center rounded-full text-2xl text-ink-muted active:bg-surface-2"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <h3 className="text-lg font-semibold">{question}</h3>
      </div>
      {children}
    </div>
  )
}

interface OptionProps {
  emoji: string
  label: string
  hint?: string
  onClick: () => void
}

/** Opción grande de una lista (un toque = elegir y avanzar). */
export function Option({ emoji, label, hint, onClick }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-control border border-line bg-bg px-4 py-2 text-left transition-colors duration-75 active:bg-surface-2"
    >
      <span aria-hidden="true" className="text-2xl">
        {emoji}
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
    </button>
  )
}

export function AmountStep({
  value,
  onChange,
  onNext,
}: {
  value: string
  onChange: (value: string) => void
  onNext: () => void
}) {
  return (
    <>
      <AmountKeypad value={value} onChange={onChange} />
      <Button size="lg" block disabled={entryToCents(value) === 0n} onClick={onNext}>
        Continuar
      </Button>
    </>
  )
}

/** Resumen en lenguaje humano antes de guardar. */
export function Confirm({
  text,
  onSave,
  children,
}: {
  text: string
  onSave: () => void
  children?: ReactNode
}) {
  return (
    <>
      <p className={cx('rounded-card border border-line bg-bg p-4 text-lg leading-snug')}>{text}</p>
      {children}
      <Button size="lg" block onClick={onSave}>
        Guardar
      </Button>
    </>
  )
}

export const fieldClass =
  'min-h-14 w-full rounded-control border border-line bg-bg px-4 text-ink placeholder:text-ink-faint'

/**
 * Guarda una captura: primero en el celular, luego intenta sincronizar.
 * Muestra el aviso con "Deshacer" (que en realidad anula) durante 10 s.
 */
export function useCapture() {
  const { session } = useAuth()
  const { toast } = useToast()
  const userId = session?.user.id

  return async (type: EventType, payload: SubmitPayload, savedMessage = 'Guardado ✓') => {
    if (!userId) return
    const clientId = await engine.enqueueSubmit(userId, type, payload)
    navigator.vibrate?.(20)
    toast({
      message: savedMessage,
      actionLabel: 'Deshacer',
      onAction: () => {
        void engine
          .enqueueVoid(userId, { client_id: clientId }, 'Deshecho al momento')
          .then(() => engine.sync(userId, { force: true }))
        toast({ message: 'Deshecho.' })
      },
    })
    void engine.sync(userId, { force: true })
  }
}
