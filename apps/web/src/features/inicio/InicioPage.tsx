import { useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { formatMXNShort } from '../../lib/money'
import { pendingEffects } from '../../lib/offline/effects'
import { engine, useOutbox } from '../../lib/offline/runtime'
import {
  useActiveProject,
  useBalances,
  useFeed,
  useMonthResult,
  useNameOf,
  useProjectResult,
  useProjects,
} from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { CobreFlow } from '../captura/CobreFlow'
import { GasteFlow } from '../captura/GasteFlow'
import { Option } from '../captura/parts'
import { PaseFlow } from '../captura/PaseFlow'
import { PuseFlow } from '../captura/PuseFlow'
import { Feed, useFeedIsEmpty } from '../feed/Feed'
import { InstallBanner } from '../pwa/InstallGuide'

type FlowName = 'gaste' | 'cobre' | 'pase' | 'puse'

const FLOWS: Record<FlowName, { emoji: string; label: string; title: string }> = {
  gaste: { emoji: '💸', label: 'Gasté', title: '💸 Gasté' },
  cobre: { emoji: '💵', label: 'Cobré', title: '💵 Cobré' },
  pase: { emoji: '🤝', label: 'Pasé efectivo', title: '🤝 Pasé efectivo' },
  puse: { emoji: '🏦', label: 'Puse dinero', title: '🏦 Puse dinero' },
}

const money = (cents: bigint) => formatMXNShort(cents < 0n ? -cents : cents)

function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify)
      window.addEventListener('offline', notify)
      return () => {
        window.removeEventListener('online', notify)
        window.removeEventListener('offline', notify)
      }
    },
    () => navigator.onLine,
  )
}

/** "Estamos en…": chip con el contexto activo; tocarlo permite cambiarlo. */
function ContextChip() {
  const { id, project } = useActiveProject()
  const projects = useProjects()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  const choose = async (projectId: string | null) => {
    setOpen(false)
    // El tipo generado no admite null, pero la función sí (null = operación general).
    const { error } = await supabase.rpc('set_active_context', {
      p_project_id: projectId as string,
    })
    if (error) toast({ message: 'No se pudo cambiar. Revisa tu conexión.' })
    else void queryClient.invalidateQueries()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          void projects.refetch() // por si alguien acaba de dar de alta una gira
        }}
        aria-label="Cambiar en qué andamos"
        className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-full border border-line bg-surface px-4 active:bg-surface-2"
      >
        <span aria-hidden="true">{project?.type?.emoji ?? '🏠'}</span>
        <span className="truncate">
          {project ? project.name : id ? 'Proyecto' : 'Operación general'}
        </span>
        <span aria-hidden="true" className="text-ink-muted">
          ▾
        </span>
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="¿En qué andamos?"
        description="Lo que registre la banda se etiqueta con esto."
      >
        <div className="space-y-2">
          <Option
            emoji="🏠"
            label="Operación general"
            hint="Nada en especial"
            onClick={() => void choose(null)}
          />
          {projects.data?.map((p) => (
            <Option
              key={p.id}
              emoji={p.type?.emoji ?? '📁'}
              label={p.name}
              hint={p.type?.name}
              onClick={() => void choose(p.id)}
            />
          ))}
          {projects.data?.length === 0 && (
            <p className="pt-2 text-sm text-ink-muted">
              Diego puede dar de alta giras y proyectos.
            </p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

/** Saldo personal en lenguaje humano, incluyendo lo que aún no sincroniza. */
function BalanceCard() {
  const { session, profile } = useAuth()
  const balances = useBalances()
  const ops = useOutbox(session?.user.id)
  const userId = session?.user.id ?? ''

  const mine = balances.data?.find((b) => b.member_id === userId)
  const pending = pendingEffects(ops, userId, profile?.role === 'contador')
  const cash = BigInt(mine?.cash_cents ?? 0) + pending.cash
  const owed = BigInt(mine?.owed_cents ?? 0) + pending.owed
  const net = cash - owed

  return (
    <Card>
      {cash >= 0n ? (
        <>
          <p className="text-ink-muted">Traes de la banda</p>
          <p className="display mt-1 text-6xl tabular-nums" data-testid="saldo-efectivo">
            {money(cash)}
          </p>
        </>
      ) : (
        <>
          <p className="text-ink-muted">Gastaste más efectivo de la banda del que traías</p>
          <p
            className="display mt-1 text-6xl text-pending tabular-nums"
            data-testid="saldo-efectivo"
          >
            −{money(cash)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">Avísale a Diego para aclararlo.</p>
        </>
      )}
      {owed > 0n && (
        <p className="mt-3 text-lg" data-testid="saldo-por-regresar">
          Te debemos <strong className="text-in">{money(owed)}</strong>
        </p>
      )}
      {owed > 0n && cash > 0n && (
        <p className="mt-1 text-sm text-ink-muted">
          {net > 0n
            ? `Haciendo cuentas, traes ${money(net)} de la banda.`
            : net < 0n
              ? `Haciendo cuentas, te debemos ${money(net)}.`
              : 'Haciendo cuentas, estamos a mano.'}
        </p>
      )}
      {cash === 0n && owed === 0n && (
        <p className="mt-2 text-ink-muted">Estás a mano con la banda.</p>
      )}
    </Card>
  )
}

/** Cómo va la banda: la gira o proyecto activo, o el mes. */
function BandCard() {
  const { id, project } = useActiveProject()
  const month = useMonthResult()
  const result = useProjectResult(id)

  if (id && result.data) {
    const net = BigInt(result.data.income_cents ?? 0) - BigInt(result.data.expense_cents ?? 0)
    return (
      <Card>
        <p className="text-ink-muted">En {project?.name ?? 'este proyecto'} vamos</p>
        <p className={`display mt-1 text-4xl tabular-nums ${net > 0n ? 'text-in' : ''}`}>
          {net >= 0n ? '+' : '−'}
          {money(net)}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <p className="text-ink-muted">Este mes en la banda</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <p>
          <span className="block text-sm text-ink-muted">Entró</span>
          <span className="display text-3xl text-in tabular-nums">
            {money(BigInt(month.data?.income_cents ?? 0))}
          </span>
        </p>
        <p>
          <span className="block text-sm text-ink-muted">Salió</span>
          <span className="display text-3xl tabular-nums">
            {money(BigInt(month.data?.expense_cents ?? 0))}
          </span>
        </p>
      </div>
    </Card>
  )
}

/** Entregas de efectivo que este usuario debe confirmar. */
function Pendientes() {
  const { session, profile } = useAuth()
  const feed = useFeed(30)
  const nameOf = useNameOf()
  const userId = session?.user.id
  const ops = useOutbox(userId)

  const answering = new Set(ops.filter((op) => op.kind === 'confirm').map((op) => op.event_id))
  const toConfirm = (feed.data ?? []).filter(
    (row) =>
      row.type === 'entrega_efectivo' &&
      row.status === 'pendiente_confirmacion' &&
      !answering.has(row.id ?? '') &&
      (row.to_member === userId || (row.to_kind !== 'integrante' && profile?.role === 'contador')),
  )
  if (!userId || toConfirm.length === 0) return null

  const answer = (eventId: string, accept: boolean) =>
    void engine
      .enqueueConfirm(userId, eventId, accept)
      .then(() => engine.sync(userId, { force: true }))

  return (
    <section aria-label="Pendientes" className="space-y-3">
      {toConfirm.map((row) => {
        const who = nameOf(row.created_by)
        const amount = money(BigInt(row.amount_cents ?? 0))
        return (
          <div key={row.id} className="rounded-card border border-pending bg-surface p-4">
            <p className="text-lg">
              {row.to_kind === 'integrante'
                ? `${who} dice que te pasó ${amount}. ¿Lo recibiste?`
                : row.to_kind === 'caja'
                  ? `${who} dice que entregó ${amount} a la caja. ¿Lo recibiste?`
                  : `${who} dice que depositó ${amount} en la cuenta. ¿Ya lo viste?`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => answer(row.id!, true)}>✅ Sí</Button>
              <Button variant="secondary" onClick={() => answer(row.id!, false)}>
                ❌ No
              </Button>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function SyncIndicator() {
  const { session } = useAuth()
  const ops = useOutbox(session?.user.id)
  const online = useOnline()
  const pending = ops.filter((op) => op.state === 'pending').length
  const failed = ops.filter((op) => op.state === 'failed').length

  const text = failed
    ? `${failed} ${failed === 1 ? 'registro no se pudo guardar' : 'registros no se pudieron guardar'}`
    : pending
      ? online
        ? `Afinando… ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`
        : `Sin señal · ${pending} ${pending === 1 ? 'guardado' : 'guardados'} en tu celular`
      : online
        ? 'Todo al día ✓'
        : 'Sin señal · todo guardado'

  return (
    <p
      role="status"
      aria-label="Sincronización"
      className={`text-center text-sm ${failed ? 'text-danger' : pending ? 'text-pending' : 'text-ink-muted'}`}
    >
      {text}
    </p>
  )
}

function ActionButton({
  emoji,
  label,
  onClick,
}: {
  emoji: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-28 flex-col items-start justify-between rounded-card border border-line bg-surface p-4 text-left text-lg font-semibold transition-transform duration-100 select-none active:scale-[0.98] active:bg-surface-2"
    >
      <span aria-hidden="true" className="text-3xl">
        {emoji}
      </span>
      {label}
    </button>
  )
}

export function InicioPage() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [flow, setFlow] = useState<FlowName | null>(null)
  const empty = useFeedIsEmpty(15)
  const close = () => setFlow(null)

  return (
    <Page number="01" title="Inicio">
      <p className="display text-4xl">
        {profile ? `Qué onda, ${profile.display_name} ${profile.emoji}` : 'Qué onda'}
      </p>

      <InstallBanner />
      <ContextChip />
      <Pendientes />
      <BalanceCard />
      <BandCard />

      <div className="grid grid-cols-2 gap-3">
        <ActionButton {...FLOWS.gaste} onClick={() => setFlow('gaste')} />
        <ActionButton {...FLOWS.cobre} onClick={() => setFlow('cobre')} />
        <ActionButton
          emoji="👕"
          label="Vendí merch"
          onClick={() => toast({ message: 'La venta de merch llega en la siguiente etapa.' })}
        />
        <ActionButton {...FLOWS.pase} onClick={() => setFlow('pase')} />
      </div>
      <Button variant="secondary" block onClick={() => setFlow('puse')}>
        🏦 Puse dinero
      </Button>

      <SyncIndicator />

      <section aria-label="Movimientos recientes">
        <h2 className="label-mono pb-1 text-ink-muted">Lo último</h2>
        {empty ? (
          <EmptyState
            emoji="🎶"
            title="Aquí va a sonar todo"
            hint="Los movimientos de la banda aparecerán aquí en vivo."
          />
        ) : (
          <Feed limit={15} />
        )}
      </section>

      <BottomSheet
        open={flow !== null}
        onOpenChange={(open) => !open && close()}
        title={flow ? FLOWS[flow].title : ''}
      >
        {flow === 'gaste' && <GasteFlow onDone={close} />}
        {flow === 'cobre' && <CobreFlow onDone={close} />}
        {flow === 'pase' && <PaseFlow onDone={close} />}
        {flow === 'puse' && <PuseFlow onDone={close} />}
      </BottomSheet>
    </Page>
  )
}
