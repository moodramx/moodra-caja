import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Switch } from 'radix-ui'
import { Button } from '../../design/Button'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { useMode } from '../../lib/mode'
import { BUILD_LABEL, checkForUpdate } from '../../lib/update'
import {
  NOTIFICATION_TYPES,
  disablePush,
  enablePush,
  pushState,
  type PushState,
} from '../../lib/push'
import { supabase } from '../../lib/supabase'
import { Onboarding } from '../onboarding/Onboarding'
import { InstallButton } from '../pwa/InstallGuide'

const CONTADOR_LINKS = [
  { to: '/contador/operacion', label: '🧾 Operación del mes' },
  { to: '/contador/cierres', label: '🔒 Cierres de mes y de año' },
  { to: '/contador/asiento', label: '✍️ Asiento manual' },
  { to: '/contador/catalogos', label: '🗂️ Catálogos' },
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

const PUSH_HINT: Record<PushState, string> = {
  no_soportado:
    'Este navegador no las permite. En iPhone, primero instala la app en la pantalla de inicio.',
  bloqueado: 'Están bloqueadas en los ajustes de tu teléfono para esta app.',
  sin_configurar: 'Todavía no están configuradas en el servidor.',
  apagado: 'Para enterarte cuando te pasen efectivo o falte cerrar un show.',
  encendido: 'Activadas en este dispositivo.',
}

/** Activar notificaciones en este dispositivo y silenciar tipos de aviso. */
function Notifications() {
  const { toast } = useToast()
  const { session } = useAuth()
  const [state, setState] = useState<PushState>('apagado')
  const [muted, setMuted] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    let cancelled = false
    void pushState().then((next) => !cancelled && setState(next))
    if (userId) {
      void supabase
        .from('notification_prefs')
        .select('muted')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => !cancelled && setMuted(data?.muted ?? []))
    }
    return () => {
      cancelled = true
    }
  }, [userId])

  const toggle = async () => {
    setBusy(true)
    try {
      setState(state === 'encendido' ? await disablePush() : await enablePush())
    } catch {
      toast({ message: 'No se pudieron activar. Intenta de nuevo con señal.' })
    } finally {
      setBusy(false)
    }
  }
  const toggleMuted = async (key: string) => {
    const next = muted.includes(key) ? muted.filter((k) => k !== key) : [...muted, key]
    setMuted(next)
    const { error } = await supabase.rpc('set_notification_muted', { p_types: next })
    if (error) toast({ message: 'No se guardó. Intenta de nuevo con señal.' })
  }

  return (
    <Card>
      <p className="font-semibold">🔔 Notificaciones</p>
      <p className="mt-1 text-sm text-ink-muted" role="status">
        {PUSH_HINT[state]}
      </p>
      {state !== 'no_soportado' && state !== 'bloqueado' && (
        <Button
          variant="secondary"
          block
          className="mt-3"
          disabled={busy}
          onClick={() => void toggle()}
        >
          {state === 'encendido' ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
        </Button>
      )}
      {state === 'encendido' && (
        <ul className="mt-3 divide-y divide-line">
          {NOTIFICATION_TYPES.map((type) => (
            <li key={type.key}>
              <label className="flex min-h-12 items-center justify-between gap-3">
                <span className="text-sm">{type.label}</span>
                <input
                  type="checkbox"
                  className="size-5"
                  checked={!muted.includes(type.key)}
                  onChange={() => void toggleMuted(type.key)}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function MasPage() {
  const { profile, signOut } = useAuth()
  const { contadorMode, canUseContadorMode, setContadorMode } = useMode()
  const [guide, setGuide] = useState(false)

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

      <Notifications />

      <Button variant="secondary" block onClick={() => setGuide(true)}>
        📖 Cómo se usa
      </Button>
      <Onboarding open={guide} onClose={() => setGuide(false)} />

      <InstallButton block />

      <Button variant="secondary" block onClick={() => void signOut()}>
        Cerrar sesión
      </Button>

      <UpdateButton />
    </Page>
  )
}
