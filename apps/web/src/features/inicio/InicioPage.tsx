import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { formatMXNShort } from '../../lib/money'
import { InstallBanner } from '../pwa/InstallGuide'

const ACTIONS = [
  { emoji: '💸', label: 'Gasté' },
  { emoji: '💵', label: 'Cobré' },
  { emoji: '👕', label: 'Vendí merch' },
  { emoji: '🤝', label: 'Pasé efectivo' },
] as const

export function InicioPage() {
  const { profile } = useAuth()
  const { toast } = useToast()

  return (
    <Page number="01" title="Inicio">
      <p className="text-2xl font-semibold">
        {profile ? `Qué onda, ${profile.display_name} ${profile.emoji}` : 'Qué onda'}
      </p>

      <InstallBanner />

      <p className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface px-4 text-ink-muted">
        <span aria-hidden="true">🏠</span> Operación general
      </p>

      <Card>
        <p className="text-ink-muted">Traes de la banda</p>
        <p className="mt-1 font-display text-5xl font-semibold tabular-nums">
          {formatMXNShort(0n)}
        </p>
        <p className="mt-2 text-ink-muted">Todavía no hay nada registrado.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => toast({ message: `"${action.label}" llega muy pronto.` })}
            className="flex min-h-28 flex-col items-start justify-between rounded-card border border-line bg-surface p-4 text-left text-lg font-semibold transition-transform duration-100 select-none active:scale-[0.98] active:bg-surface-2"
          >
            <span aria-hidden="true" className="text-3xl">
              {action.emoji}
            </span>
            {action.label}
          </button>
        ))}
      </div>

      <EmptyState
        emoji="🎶"
        title="Aquí va a sonar todo"
        hint="Los movimientos de la banda aparecerán aquí en vivo."
      />

      <p className="text-center text-sm text-ink-muted">Todo al día ✓</p>
    </Page>
  )
}
