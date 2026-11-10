import { useState } from 'react'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { useInstall } from './useInstall'

const DISMISS_KEY = 'moodra-caja-instalar-oculto'

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold tabular-nums">
            {index + 1}
          </span>
          <span className="pt-1">{step}</span>
        </li>
      ))}
    </ol>
  )
}

/** Botón "Instalar" + hoja con la guía según el dispositivo. */
export function InstallButton({
  block = false,
  label = '📲 Instalar en mi celular',
}: {
  block?: boolean
  label?: string
}) {
  const { platform, promptInstall } = useInstall()
  const [guideOpen, setGuideOpen] = useState(false)

  if (platform === 'installed') return null

  return (
    <>
      <Button
        variant="secondary"
        block={block}
        onClick={() => (platform === 'prompt' ? void promptInstall() : setGuideOpen(true))}
      >
        {label}
      </Button>
      <BottomSheet
        open={guideOpen}
        onOpenChange={setGuideOpen}
        title="Ponla en tu pantalla de inicio"
        description="Así abre como app, funciona sin señal y te pueden llegar avisos."
      >
        {platform === 'ios' ? (
          <Steps
            steps={[
              'Abre esta página en Safari (no en Chrome ni dentro de Instagram o WhatsApp).',
              'Toca el botón Compartir: el cuadrito con la flecha hacia arriba.',
              'Baja y elige "Agregar a inicio".',
              'Toca "Agregar". Listo: abre Moodra $$ desde tu pantalla de inicio.',
            ]}
          />
        ) : (
          <Steps
            steps={[
              'Abre esta página en Chrome.',
              'Toca el menú de los tres puntitos, arriba a la derecha.',
              'Elige "Instalar app" o "Agregar a pantalla principal".',
              'Confirma. Listo: abre Moodra $$ desde tu pantalla de inicio.',
            ]}
          />
        )}
      </BottomSheet>
    </>
  )
}

/** Tarjeta en Inicio que invita a instalar; se puede ocultar. */
export function InstallBanner() {
  const { platform } = useInstall()
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (platform === 'installed' || hidden) return null

  return (
    <section
      aria-label="Instalar la app"
      className="rounded-card border border-line bg-surface p-4"
    >
      <p className="font-semibold">Instala Moodra $$</p>
      <p className="mt-1 text-ink-muted">Para que funcione sin señal y abra como app.</p>
      <div className="mt-3 flex gap-2">
        <InstallButton label="📲 Instalar" />
        <Button
          variant="ghost"
          className="whitespace-nowrap"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            setHidden(true)
          }}
        >
          Ahora no
        </Button>
      </div>
    </section>
  )
}
