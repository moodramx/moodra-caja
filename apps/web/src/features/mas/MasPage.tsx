import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Switch } from 'radix-ui'
import { Button } from '../../design/Button'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { useMode } from '../../lib/mode'
import { BUILD_LABEL, checkForUpdate } from '../../lib/update'
import { InstallButton } from '../pwa/InstallGuide'

const CONTADOR_LINKS = [
  { to: '/contador/usuarios', label: '👥 Usuarios' },
  { to: '/contador/productos', label: '🏷️ Productos y precios' },
  { to: '/contador/boleteras', label: '🎟️ Boleteras' },
  { to: '/contador/diario', label: '📒 Libro diario' },
  { to: '/contador/balanza', label: '⚖️ Balanza' },
] as const

const rowClass =
  'flex min-h-14 items-center justify-between gap-3 rounded-control px-3 -mx-3 active:bg-surface-2'

function UpdateButton() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const look = async () => {
    setBusy(true)
    const found = await checkForUpdate()
    setBusy(false)
    toast({
      message: found
        ? 'Hay versión nueva: se instala sola en unos segundos.'
        : navigator.onLine
          ? 'Ya tienes la última versión.'
          : 'Sin señal: no se pudo buscar.',
    })
  }
  return (
    <div className="text-center">
      <p className="text-sm text-ink-faint">Moodra $$ · versión del {BUILD_LABEL}</p>
      <Button variant="ghost" disabled={busy} onClick={() => void look()}>
        {busy ? 'Buscando…' : 'Buscar actualización'}
      </Button>
    </div>
  )
}

export function MasPage() {
  const { profile, signOut } = useAuth()
  const { contadorMode, canUseContadorMode, setContadorMode } = useMode()

  return (
    <Page number="06" title="Más">
      <Card>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-full bg-surface-2 text-2xl"
          >
            {profile?.emoji ?? '🎵'}
          </span>
          <div>
            <p className="text-lg font-semibold">{profile?.display_name ?? '…'}</p>
            <p className="text-ink-muted">@{profile?.username ?? '…'}</p>
          </div>
        </div>
      </Card>

      {canUseContadorMode && (
        <Card>
          <label className={rowClass}>
            <span>
              <span className="block font-semibold">Modo contador</span>
              <span className="block text-sm text-ink-muted">
                Apágalo para ver la app como la ve la banda.
              </span>
            </span>
            <Switch.Root
              checked={contadorMode}
              onCheckedChange={setContadorMode}
              className="relative h-8 w-14 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent"
            >
              <Switch.Thumb className="block size-6 translate-x-1 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-7 data-[state=checked]:bg-accent-ink" />
            </Switch.Root>
          </label>
          {contadorMode &&
            CONTADOR_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className={rowClass}>
                <span className="font-semibold">{link.label}</span>
                <span aria-hidden="true" className="text-ink-muted">
                  ›
                </span>
              </Link>
            ))}
        </Card>
      )}

      <Card>
        <Link to="/saldos" className={rowClass}>
          <span className="font-semibold">💰 Saldos de la banda</span>
          <span aria-hidden="true" className="text-ink-muted">
            ›
          </span>
        </Link>
        <Link to="/shows" className={rowClass}>
          <span className="font-semibold">🎸 Shows</span>
          <span aria-hidden="true" className="text-ink-muted">
            ›
          </span>
        </Link>
        <Link to="/proyectos" className={rowClass}>
          <span className="font-semibold">🚐 Giras y proyectos</span>
          <span aria-hidden="true" className="text-ink-muted">
            ›
          </span>
        </Link>
        <Link to="/componentes" className={rowClass}>
          <span className="font-semibold">🎛️ Probar componentes</span>
          <span aria-hidden="true" className="text-ink-muted">
            ›
          </span>
        </Link>
      </Card>

      <InstallButton block />

      <Button variant="secondary" block onClick={() => void signOut()}>
        Cerrar sesión
      </Button>

      <UpdateButton />
    </Page>
  )
}
