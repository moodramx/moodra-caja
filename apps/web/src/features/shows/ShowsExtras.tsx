// Piezas de shows que viven en otras pantallas: alta rápida desde el cobro de
// merch, aviso de shows sin cerrar en Inicio y lo que está por cobrar en Saldos.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Card } from '../../design/Page'
import { useAuth } from '../../lib/auth'
import type { Json } from '../../lib/database.types'
import type { CobroPendientePayload, MoneyPlace } from '../../lib/events'
import { INCOME_PLACE_OPTIONS } from '../../lib/humanize'
import { entryToCents, formatMXNShort } from '../../lib/money'
import { useReceivables } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { AmountStep, Confirm, fieldClass, Option, Step, useCapture } from '../captura/parts'
import { useShowsToClose } from './Shows'

const money = (cents: bigint | number | null) => formatMXNShort(BigInt(cents ?? 0))
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())

/** Alta rápida de un show (solo nombre) desde el cobro de merch. El trato se pone después. */
export function QuickShowForm({ onCreated }: { onCreated: (showId: string) => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('save_show', {
        p_payload: { name: name.trim(), date: today(), deal_type: 'sin_pago' } as unknown as Json,
      })
      if (error) {
        throw new Error(
          /fetch|network/i.test(error.message) ? 'Necesitas internet para crearlo.' : error.message,
        )
      }
      return data
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries()
      onCreated(id)
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (name.trim()) create.mutate()
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">Nombre del show o lugar</span>
        <input
          aria-label="Nombre"
          className={fieldClass}
          value={name}
          maxLength={80}
          placeholder="Ej. Foro Indie Rocks"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p className="text-sm text-ink-muted">
        Queda con fecha de hoy. El trato se completa después en Shows.
      </p>
      {create.error && (
        <p role="alert" className="text-danger">
          {create.error.message}
        </p>
      )}
      <Button type="submit" block disabled={!name.trim() || create.isPending}>
        {create.isPending ? 'Creando…' : 'Crear'}
      </Button>
    </form>
  )
}

/** Aviso en Inicio: shows que ya pasaron y nadie ha cerrado. */
export function ShowsToClose() {
  const shows = useShowsToClose()
  if (shows.length === 0) return null
  return (
    <section aria-label="Shows por cerrar" className="space-y-3">
      {shows.slice(0, 3).map((show) => (
        <div key={show.id} className="rounded-card border border-pending bg-surface p-4">
          <p className="text-lg">
            🎤 Falta cerrar <strong>{show.name}</strong>. Son 10 segundos: cuánto les pagaron y
            dónde quedó.
          </p>
          <Link
            to="/shows"
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 font-semibold text-bg"
          >
            Cerrar show
          </Link>
        </div>
      ))}
    </section>
  )
}

type Receivable = NonNullable<ReturnType<typeof useReceivables>['data']>[number]

/** Llegó el dinero de algo pendiente: cuánto → dónde quedó → confirmar. */
function CobroFlow({ row, onDone }: { row: Receivable; onDone: () => void }) {
  const capture = useCapture()
  const balance = BigInt(row.balance_cents ?? 0)
  const [amount, setAmount] = useState((Number(balance) / 100).toString())
  const [destination, setDestination] = useState<MoneyPlace | null>(null)
  const [step, setStep] = useState<'monto' | 'destino' | 'confirmar'>('monto')
  const tooMuch = entryToCents(amount) > balance

  if (step === 'monto') {
    return (
      <Step question="¿Cuánto llegó?">
        <p className="text-ink-muted">Nos deben {money(balance)}.</p>
        <AmountStep
          value={amount}
          onChange={setAmount}
          onNext={() => !tooMuch && setStep('destino')}
        />
        {tooMuch && (
          <p role="alert" className="text-danger">
            Es más de lo que nos deben.
          </p>
        )}
      </Step>
    )
  }
  if (step === 'destino') {
    return (
      <Step question="¿Dónde quedó?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          {[...INCOME_PLACE_OPTIONS].reverse().map((option) => (
            <Option
              key={option.value}
              emoji={option.emoji}
              label={option.label}
              onClick={() => {
                setDestination(option.value)
                setStep('confirmar')
              }}
            />
          ))}
        </div>
      </Step>
    )
  }
  if (!destination) return null
  const payload: CobroPendientePayload = {
    amount_cents: Number(entryToCents(amount)),
    platform_id: row.platform_id ?? undefined,
    destination,
  }
  const rest = balance - entryToCents(amount)
  return (
    <Step question="¿Así quedó?" onBack={() => setStep('destino')}>
      <Confirm
        text={`Llegaron ${money(entryToCents(amount))} de ${row.name?.replace('Por cobrar a ', '') ?? 'lo pendiente'}. ${rest > 0n ? `Todavía nos deben ${money(rest)}.` : 'Ya no nos deben nada de ahí.'}`}
        onSave={() => {
          void capture('cobro_pendiente', payload)
          onDone()
        }}
      />
    </Step>
  )
}

/** Lo que nos deben venues y boleteras, y los anticipos de shows aún sin cerrar. */
export function PorCobrar() {
  const { profile } = useAuth()
  const receivables = useReceivables()
  const [paying, setPaying] = useState<Receivable | null>(null)
  const rows = receivables.data ?? []
  if (rows.length === 0) return null

  return (
    <Card>
      <p className="text-ink-muted">Nos deben</p>
      <ul className="mt-1 divide-y divide-line">
        {rows.map((row) => {
          const advance = row.code === '2.3'
          const canCollect = !advance && (row.platform_id === null || profile?.role === 'contador')
          return (
            <li
              key={row.account_id}
              className="flex min-h-14 items-center justify-between gap-3 py-2"
            >
              <span>
                <span className="block font-semibold">
                  {advance
                    ? 'Anticipos de shows por cerrar'
                    : (row.name?.replace('Por cobrar a ', '') ?? row.name)}
                </span>
                <span className="block text-sm text-ink-muted tabular-nums">
                  {money(row.balance_cents)}
                  {advance && ' ya cobrados; se aplican al cerrar el show'}
                  {row.settlement_days ? ` · suele liquidar en ${row.settlement_days} días` : ''}
                </span>
              </span>
              {canCollect && (
                <Button variant="secondary" onClick={() => setPaying(row)}>
                  Ya llegó
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <BottomSheet
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        title="💵 Ya nos pagaron"
      >
        {paying && <CobroFlow row={paying} onDone={() => setPaying(null)} />}
      </BottomSheet>
    </Card>
  )
}
