import { useState } from 'react'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { cx } from '../../design/cx'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type {
  EntregaPayload,
  FeedRow,
  GastoPayload,
  IngresoPayload,
  PuseDineroPayload,
} from '../../lib/events'
import { feedText, timeAgo, type FeedText } from '../../lib/humanize'
import type { OutboxOp } from '../../lib/offline/db'
import { engine, useOutbox } from '../../lib/offline/runtime'
import { useCategories, useFeed, useNameOf, useSettings } from '../../lib/queries'
import { fieldClass } from '../captura/parts'

const badgeClass: Record<NonNullable<FeedText['badge']> | 'local' | 'error', string> = {
  'por confirmar': 'text-pending',
  rechazado: 'text-danger',
  anulado: 'text-void',
  local: 'text-pending',
  error: 'text-danger',
}

function Row({
  emoji,
  title,
  meta,
  badge,
  badgeKind,
  struck,
  onClick,
}: {
  emoji: string
  title: string
  meta: string
  badge?: string
  badgeKind?: keyof typeof badgeClass
  struck?: boolean
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx(
        'flex min-h-16 w-full items-center gap-3 py-2 text-left',
        onClick && '-mx-2 w-[calc(100%+1rem)] rounded-control px-2 active:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl"
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-medium', struck && 'text-void line-through')}>{title}</span>
        <span className="block text-sm text-ink-muted">
          {meta}
          {badge && (
            <span className={cx('font-semibold', badgeKind && badgeClass[badgeKind])}>
              {' '}
              · {badge}
            </span>
          )}
        </span>
      </span>
    </Tag>
  )
}

/** Convierte una captura local en un renglón con la misma forma que el feed. */
function opAsRow(op: OutboxOp, categories: { id: string; name: string; emoji: string }[]): FeedRow {
  const p = op.payload as Partial<
    GastoPayload & IngresoPayload & EntregaPayload & PuseDineroPayload
  >
  const category = categories.find((c) => c.id === p.category_id)
  return {
    type: op.type ?? null,
    status: 'registrado',
    created_by: op.user_id,
    amount_cents: p.amount_cents ?? 0,
    category_name: category?.name ?? null,
    category_emoji: category?.emoji ?? null,
    to_kind: p.to_kind ?? null,
    to_member: p.to_member ?? null,
    fund_kind: p.kind ?? null,
    fund_member: (p as { member_id?: string }).member_id ?? null,
    captured_at: op.captured_at,
  } as FeedRow
}

/** Capturas guardadas en este celular que aún no llegan (o que el servidor rechazó). */
function LocalRows() {
  const { session } = useAuth()
  const userId = session?.user.id
  const ops = useOutbox(userId).filter((op) => op.kind === 'submit')
  const categories = useCategories()
  const nameOf = useNameOf()

  return ops.map((op) => {
    const text = feedText(opAsRow(op, categories.data ?? []), nameOf)
    const failed = op.state === 'failed'
    return (
      <li key={op.client_id}>
        <Row
          emoji={text.emoji}
          title={text.title}
          meta={timeAgo(op.captured_at)}
          badge={
            failed ? `no se pudo guardar: ${op.last_error ?? 'error'}` : 'pendiente de sincronizar'
          }
          badgeKind={failed ? 'error' : 'local'}
        />
        {failed && userId && (
          <div className="flex gap-2 pb-2 pl-14">
            <Button
              variant="secondary"
              onClick={() =>
                void engine.retry(op.client_id).then(() => engine.sync(userId, { force: true }))
              }
            >
              Reintentar
            </Button>
            <Button variant="ghost" onClick={() => void engine.discard(op.client_id)}>
              Descartar
            </Button>
          </div>
        )}
      </li>
    )
  })
}

function VoidSheet({
  row,
  openedAt,
  onClose,
}: {
  row: FeedRow | null
  openedAt: number
  onClose: () => void
}) {
  const { session, profile } = useAuth()
  const { toast } = useToast()
  const settings = useSettings()
  const nameOf = useNameOf()
  const [reason, setReason] = useState('')
  const userId = session?.user.id

  const hours = settings.data?.void_window_hours ?? 24
  const mine = row?.created_by === userId
  const fresh = row?.created_at
    ? openedAt - new Date(row.created_at).getTime() < hours * 3_600_000
    : false
  const canVoid =
    row !== null &&
    (row.status === 'registrado' || row.status === 'pendiente_confirmacion') &&
    (profile?.role === 'contador' || (mine && fresh))
  const text = row ? feedText(row, nameOf) : null

  return (
    <BottomSheet
      open={row !== null}
      onOpenChange={(open) => !open && onClose()}
      title={text ? `${text.emoji} ${text.title}` : ''}
      description={row?.captured_at ? timeAgo(row.captured_at) : undefined}
    >
      {row && (
        <div className="space-y-4">
          {row.description && <p>“{row.description}”</p>}
          {row.note && <p className="text-pending">{row.note}</p>}
          {row.status === 'anulado' && (
            <p className="text-ink-muted">
              Anulado{row.void_reason ? `: ${row.void_reason}` : '.'}
            </p>
          )}
          {canVoid ? (
            <>
              <label className="block space-y-2">
                <span className="text-sm text-ink-muted">¿Por qué lo anulas?</span>
                <input
                  className={fieldClass}
                  value={reason}
                  maxLength={120}
                  placeholder="Ej. me equivoqué de monto"
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <Button
                variant="danger"
                block
                disabled={reason.trim().length < 3}
                onClick={() => {
                  if (!userId || !row.id) return
                  void engine
                    .enqueueVoid(userId, { event_id: row.id }, reason.trim())
                    .then(() => engine.sync(userId, { force: true }))
                  toast({ message: 'Anulado. No se borra: queda tachado en el historial.' })
                  setReason('')
                  onClose()
                }}
              >
                Anular este registro
              </Button>
            </>
          ) : (
            row.status === 'registrado' && (
              <p className="text-sm text-ink-muted">
                {mine
                  ? `Ya pasaron ${hours} horas. Si hay que corregirlo, pídeselo a Diego.`
                  : 'Solo quien lo registró (o Diego) puede anularlo.'}
              </p>
            )
          )}
        </div>
      )}
    </BottomSheet>
  )
}

/** Movimientos de toda la banda, con lo local arriba. Tocar uno abre su detalle. */
export function Feed({ limit }: { limit: number }) {
  const feed = useFeed(limit)
  const nameOf = useNameOf()
  const [selected, setSelected] = useState<{ row: FeedRow; at: number } | null>(null)

  return (
    <>
      <ul className="divide-y divide-line">
        <LocalRows />
        {feed.data?.map((row) => {
          const text = feedText(row, nameOf)
          return (
            <li key={row.id}>
              <Row
                emoji={text.emoji}
                title={text.title}
                meta={timeAgo(row.captured_at ?? '')}
                badge={text.badge}
                badgeKind={text.badge}
                struck={row.status === 'anulado' || row.status === 'rechazado'}
                onClick={() => setSelected({ row, at: Date.now() })}
              />
            </li>
          )
        })}
      </ul>
      {feed.isPending && <p className="py-4 text-ink-muted">Afinando…</p>}
      <VoidSheet
        row={selected?.row ?? null}
        openedAt={selected?.at ?? 0}
        onClose={() => setSelected(null)}
      />
    </>
  )
}

/** true si no hay nada que mostrar (ni local ni del servidor). */
export function useFeedIsEmpty(limit: number): boolean {
  const { session } = useAuth()
  const feed = useFeed(limit)
  const ops = useOutbox(session?.user.id)
  return feed.data?.length === 0 && ops.filter((op) => op.kind === 'submit').length === 0
}
