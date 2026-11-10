// Shows: alta con su trato, lista, detalle con resultado, cierre y anticipos.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type { Json } from '../../lib/database.types'
import type {
  AnticipoPayload,
  CierrePayload,
  DealType,
  GastoPayload,
  MoneyPlace,
} from '../../lib/events'
import { INCOME_PLACE_OPTIONS } from '../../lib/humanize'
import { centsToDecimalString, entryToCents, formatMXNShort } from '../../lib/money'
import { engine } from '../../lib/offline/runtime'
import {
  useCategories,
  usePlatforms,
  useProjects,
  useShowPnl,
  useShows,
  type ShowRow,
} from '../../lib/queries'
import { commissionFor, shareOf } from '../../lib/shows'
import { supabase } from '../../lib/supabase'
import { AmountStep, Confirm, fieldClass, Option, Step, useCapture } from '../captura/parts'

const money = (cents: bigint | number | null) => formatMXNShort(BigInt(cents ?? 0))
const toEntry = (cents: number | null) =>
  centsToDecimalString(BigInt(cents ?? 0)).replace(/\.00$/, '')
const validMoney = (text: string) => /^\d*(\.\d{1,2})?$/.test(text.trim())
const cents = (text: string) => Number(entryToCents(text.trim() || '0'))
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const niceDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

export const DEALS: { value: DealType; label: string; hint: string }[] = [
  { value: 'fee_fijo', label: 'Pago fijo', hint: 'Nos pagan una cantidad acordada' },
  {
    value: 'porcentaje_taquilla',
    label: '% de taquilla',
    hint: 'Nos toca un porcentaje de lo que entre',
  },
  { value: 'fee_mas_porcentaje', label: 'Fijo + %', hint: 'Una cantidad fija más un porcentaje' },
  { value: 'boletaje_propio', label: 'Boletos nuestros', hint: 'Nosotros vendemos los boletos' },
  { value: 'sin_pago', label: 'Sin pago', hint: 'No nos pagan (los gastos sí cuentan)' },
]
const dealLabel = (deal: DealType | null) => DEALS.find((d) => d.value === deal)?.label ?? ''

/** "Pago fijo de $8,000", "70 % de taquilla", etc. */
export function dealText(show: ShowRow): string {
  switch (show.deal_type) {
    case 'fee_fijo':
      return `Pago fijo de ${money(show.fee_cents)}`
    case 'porcentaje_taquilla':
      return `${Number(show.percentage)} % de la taquilla`
    case 'fee_mas_porcentaje':
      return `${money(show.fee_cents)} fijos + ${Number(show.percentage)} % de la taquilla`
    case 'boletaje_propio':
      return `Boletos nuestros a ${money(show.ticket_price_cents)}${show.platform ? ` por ${show.platform.name}` : ' en puerta'}`
    default:
      return 'Sin pago'
  }
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------
interface Draft {
  id?: string
  name: string
  city: string
  date: string
  project_id: string | null
  deal_type: DealType
  fee: string
  percentage: string
  price: string
  tickets: string
  platform_id: string | null
}

const newDraft = (): Draft => ({
  name: '',
  city: '',
  date: today(),
  project_id: null,
  deal_type: 'fee_fijo',
  fee: '',
  percentage: '',
  price: '',
  tickets: '',
  platform_id: null,
})

const draftOf = (show: ShowRow): Draft => ({
  id: show.id,
  name: show.name,
  city: show.city ?? '',
  date: show.date,
  project_id: show.project_id,
  deal_type: show.deal_type,
  fee: toEntry(show.fee_cents),
  percentage: String(Number(show.percentage) || ''),
  price: toEntry(show.ticket_price_cents),
  tickets: String(show.expected_tickets || ''),
  platform_id: show.platform_id,
})

export function ShowForm({ initial, onSaved }: { initial: Draft; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient()
  const projects = useProjects()
  const platforms = usePlatforms()
  const [d, setD] = useState(initial)
  const set = (patch: Partial<Draft>) => setD((current) => ({ ...current, ...patch }))
  const giras = (projects.data ?? []).filter(
    (p) => p.type?.code === 'GIR' || p.type?.code === 'INT',
  )
  const usesFee = d.deal_type === 'fee_fijo' || d.deal_type === 'fee_mas_porcentaje'
  const usesPct = d.deal_type === 'porcentaje_taquilla' || d.deal_type === 'fee_mas_porcentaje'
  const usesTickets = usesPct || d.deal_type === 'boletaje_propio'

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('save_show', {
        p_payload: {
          id: d.id,
          name: d.name.trim(),
          city: d.city.trim(),
          date: d.date,
          project_id: d.id ? undefined : d.project_id,
          deal_type: d.deal_type,
          fee_cents: usesFee ? cents(d.fee) : 0,
          percentage: usesPct ? Number(d.percentage) || 0 : 0,
          ticket_price_cents: usesTickets ? cents(d.price) : 0,
          expected_tickets: usesTickets ? Number(d.tickets) || 0 : 0,
          platform_id: d.deal_type === 'boletaje_propio' ? d.platform_id : null,
        } as unknown as Json,
      })
      if (error)
        throw new Error(
          /fetch|network/i.test(error.message) ? 'Necesitas internet.' : error.message,
        )
      return data
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries()
      onSaved(id)
    },
  })

  const valid =
    d.name.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
    validMoney(d.fee) &&
    validMoney(d.price) &&
    (!usesPct || (Number(d.percentage) > 0 && Number(d.percentage) <= 100))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (valid) save.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block space-y-1">
        <span className="text-sm text-ink-muted">Nombre del show o lugar</span>
        <input
          className={fieldClass}
          value={d.name}
          maxLength={80}
          placeholder="Ej. Foro Indie Rocks"
          onChange={(event) => set({ name: event.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-sm text-ink-muted">Fecha</span>
          <input
            className={fieldClass}
            type="date"
            value={d.date}
            onChange={(event) => set({ date: event.target.value })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-ink-muted">Ciudad</span>
          <input
            className={fieldClass}
            value={d.city}
            maxLength={40}
            onChange={(event) => set({ city: event.target.value })}
          />
        </label>
      </div>

      {!d.id && giras.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-ink-muted">¿Es parte de una gira?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={d.project_id === null} onClick={() => set({ project_id: null })}>
              No, es un show suelto
            </Chip>
            {giras.map((gira) => (
              <Chip
                key={gira.id}
                emoji={gira.type?.emoji}
                selected={d.project_id === gira.id}
                onClick={() => set({ project_id: gira.id })}
              >
                {gira.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm text-ink-muted">¿Cómo nos pagan?</legend>
        <div className="flex flex-wrap gap-2">
          {DEALS.map((deal) => (
            <Chip
              key={deal.value}
              selected={d.deal_type === deal.value}
              onClick={() => set({ deal_type: deal.value })}
            >
              {deal.label}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          {DEALS.find((deal) => deal.value === d.deal_type)?.hint}.
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        {usesFee && (
          <label className="block space-y-1">
            <span className="text-sm text-ink-muted">Pago fijo ($)</span>
            <input
              className={`${fieldClass} tabular-nums`}
              inputMode="decimal"
              value={d.fee}
              onChange={(event) => set({ fee: event.target.value })}
            />
          </label>
        )}
        {usesPct && (
          <label className="block space-y-1">
            <span className="text-sm text-ink-muted">Nuestro porcentaje (%)</span>
            <input
              className={`${fieldClass} tabular-nums`}
              inputMode="decimal"
              value={d.percentage}
              onChange={(event) => set({ percentage: event.target.value.replace(/[^\d.]/g, '') })}
            />
          </label>
        )}
        {usesTickets && (
          <>
            <label className="block space-y-1">
              <span className="text-sm text-ink-muted">Precio del boleto ($)</span>
              <input
                className={`${fieldClass} tabular-nums`}
                inputMode="decimal"
                value={d.price}
                onChange={(event) => set({ price: event.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-ink-muted">Boletos que esperamos</span>
              <input
                className={`${fieldClass} tabular-nums`}
                inputMode="numeric"
                value={d.tickets}
                onChange={(event) => set({ tickets: event.target.value.replace(/\D/g, '') })}
              />
            </label>
          </>
        )}
      </div>

      {d.deal_type === 'boletaje_propio' && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-ink-muted">¿Por dónde se venden los boletos?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={d.platform_id === null} onClick={() => set({ platform_id: null })}>
              En puerta
            </Chip>
            {platforms.data
              ?.filter((platform) => platform.active)
              .map((platform) => (
                <Chip
                  key={platform.id}
                  selected={d.platform_id === platform.id}
                  onClick={() => set({ platform_id: platform.id })}
                >
                  {platform.name}
                </Chip>
              ))}
          </div>
        </fieldset>
      )}

      {save.error && (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={!valid || save.isPending}>
        {save.isPending ? 'Guardando…' : 'Guardar show'}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Cierre de show
// ---------------------------------------------------------------------------
type CierreStep = 'fee' | 'taquilla' | 'parte' | 'boletos' | 'destino' | 'confirmar'
interface StaffPayment {
  description: string
  amount: string
  paidWith: 'efectivo_banda' | 'cuenta_banda' | 'pendiente'
}

/** Asistente: cuánto les pagaron → dónde quedó → pagos a terceros → guardar. */
export function CierreFlow({ show, onDone }: { show: ShowRow; onDone: () => void }) {
  const { session } = useAuth()
  const capture = useCapture()
  const categories = useCategories()
  const platforms = usePlatforms()
  const deal = show.deal_type
  const first: CierreStep =
    deal === 'fee_fijo' || deal === 'fee_mas_porcentaje'
      ? 'fee'
      : deal === 'porcentaje_taquilla'
        ? 'taquilla'
        : deal === 'boletaje_propio'
          ? 'boletos'
          : 'confirmar'

  const [step, setStep] = useState<CierreStep>(first)
  const [fee, setFee] = useState(toEntry(show.fee_cents))
  const [taquilla, setTaquilla] = useState('')
  const [share, setShare] = useState('')
  const [tickets, setTickets] = useState(String(show.expected_tickets || ''))
  const [gross, setGross] = useState('')
  const [platformId, setPlatformId] = useState<string | null>(show.platform_id)
  const [destination, setDestination] = useState<MoneyPlace | null | undefined>(undefined)
  const [staff, setStaff] = useState<StaffPayment[]>([])

  const platform = platforms.data?.find((p) => p.id === platformId) ?? null
  const feeCents = deal === 'fee_fijo' || deal === 'fee_mas_porcentaje' ? cents(fee) : 0
  const shareCents =
    deal === 'porcentaje_taquilla' || deal === 'fee_mas_porcentaje' ? cents(share) : 0
  const ticketsSold = Number(tickets) || 0
  const grossCents = deal === 'boletaje_propio' ? cents(gross) : 0
  const commission =
    platform && platform.bearer === 'banda'
      ? Number(
          commissionFor(
            BigInt(grossCents),
            ticketsSold,
            Number(platform.commission_pct),
            BigInt(platform.commission_fixed_cents),
          ),
        )
      : 0
  const income = feeCents + shareCents + grossCents
  const viaPlatform = deal === 'boletaje_propio' && platform !== null
  const needsDestination = income > 0 && !viaPlatform

  const payload: CierrePayload = {
    show_id: show.id,
    fee_cents: feeCents,
    share_cents: shareCents,
    gross_cents: grossCents,
    tickets_sold: ticketsSold,
    commission_cents: commission,
    platform_id: viaPlatform ? platformId : null,
    destination: needsDestination ? (destination ?? null) : null,
  }

  const save = () => {
    void capture('cierre_show', payload, 'Show cerrado ✓')
    const category = categories.data?.find((c) => c.slug === 'staff')
    if (session && category) {
      for (const payment of staff) {
        if (cents(payment.amount) <= 0) continue
        const gasto: GastoPayload = {
          amount_cents: cents(payment.amount),
          category_id: category.id,
          paid_with: payment.paidWith,
          description: payment.description.trim() || undefined,
          show_id: show.id,
        }
        void engine.enqueueSubmit(session.user.id, 'gasto', gasto)
      }
      void engine.sync(session.user.id, { force: true })
    }
    onDone()
  }

  if (step === 'fee') {
    return (
      <Step question="¿Cuánto les pagaron de fijo?">
        <AmountStep
          value={fee}
          onChange={setFee}
          onNext={() => setStep(deal === 'fee_mas_porcentaje' ? 'taquilla' : 'destino')}
        />
      </Step>
    )
  }
  if (step === 'taquilla') {
    return (
      <Step
        question="¿De cuánto fue la taquilla?"
        onBack={deal === 'fee_mas_porcentaje' ? () => setStep('fee') : undefined}
      >
        <p className="text-ink-muted">
          El total de la puerta, antes de repartir. Les toca el {Number(show.percentage)} %.
        </p>
        <AmountStep
          value={taquilla}
          onChange={setTaquilla}
          onNext={() => {
            setShare(toEntry(Number(shareOf(entryToCents(taquilla), Number(show.percentage)))))
            setStep('parte')
          }}
        />
      </Step>
    )
  }
  if (step === 'parte') {
    return (
      <Step question="¿Cuánto les tocó?" onBack={() => setStep('taquilla')}>
        <p className="text-ink-muted">
          El {Number(show.percentage)} % de {money(entryToCents(taquilla))}. Corrígelo si les dieron
          otra cantidad.
        </p>
        <AmountStep value={share} onChange={setShare} onNext={() => setStep('destino')} />
      </Step>
    )
  }
  if (step === 'boletos') {
    return (
      <Step question="¿Cuántos boletos se vendieron?">
        <label className="block space-y-1">
          <span className="text-sm text-ink-muted">Boletos vendidos</span>
          <input
            className={`${fieldClass} display text-3xl tabular-nums`}
            inputMode="numeric"
            value={tickets}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, '')
              setTickets(next)
              setGross(toEntry(Number(next || 0) * show.ticket_price_cents))
            }}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-ink-muted">Total vendido ($)</span>
          <input
            className={`${fieldClass} tabular-nums`}
            inputMode="decimal"
            value={gross}
            onChange={(event) => setGross(event.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Chip selected={platformId === null} onClick={() => setPlatformId(null)}>
            En puerta
          </Chip>
          {platforms.data
            ?.filter((p) => p.active)
            .map((p) => (
              <Chip key={p.id} selected={platformId === p.id} onClick={() => setPlatformId(p.id)}>
                {p.name}
              </Chip>
            ))}
        </div>
        {viaPlatform && (
          <p className="text-sm text-ink-muted">
            {commission > 0
              ? `${platform.name} se queda ${money(commission)} de comisión. Nos debe ${money(grossCents - commission)}.`
              : `${platform.name} nos debe ${money(grossCents)}.`}{' '}
            Queda por cobrar hasta que liquide.
          </p>
        )}
        <Button
          size="lg"
          block
          disabled={!validMoney(gross) || grossCents <= 0}
          onClick={() => setStep(viaPlatform ? 'confirmar' : 'destino')}
        >
          Continuar
        </Button>
      </Step>
    )
  }
  if (step === 'destino') {
    const choose = (next: MoneyPlace | null) => {
      setDestination(next)
      setStep('confirmar')
    }
    return (
      <Step
        question="¿Dónde quedó el dinero?"
        onBack={() =>
          setStep(deal === 'fee_fijo' ? 'fee' : deal === 'boletaje_propio' ? 'boletos' : 'parte')
        }
      >
        <div className="space-y-2">
          {INCOME_PLACE_OPTIONS.map((option) => (
            <Option
              key={option.value}
              emoji={option.emoji}
              label={option.label}
              onClick={() => choose(option.value)}
            />
          ))}
          <Option
            emoji="⏳"
            label="Todavía no nos pagan"
            hint="Queda pendiente de cobro"
            onClick={() => choose(null)}
          />
        </div>
      </Step>
    )
  }

  const where = !needsDestination
    ? viaPlatform
      ? `Queda por cobrar a ${platform.name}.`
      : ''
    : destination === null || destination === undefined
      ? 'Queda pendiente de cobro.'
      : (INCOME_PLACE_OPTIONS.find((o) => o.value === destination)?.label ?? '') + '.'

  return (
    <Step
      question="¿Así quedó?"
      onBack={
        first === 'confirmar' ? undefined : () => setStep(needsDestination ? 'destino' : first)
      }
    >
      <Confirm
        text={
          income === 0
            ? `Cerraste ${show.name} sin pago. Sus gastos sí cuentan en el resultado.`
            : `Cerraste ${show.name}: ${money(income)}${commission ? ` (menos ${money(commission)} de comisión)` : ''}. ${where}`
        }
        onSave={save}
      >
        <section aria-label="Pagos a terceros" className="space-y-2">
          <p className="font-semibold">¿Le pagaron a alguien del show?</p>
          <p className="text-sm text-ink-muted">
            Ingeniero, roadie, visuales, músico invitado. Es opcional.
          </p>
          {staff.map((payment, index) => {
            const patch = (next: Partial<StaffPayment>) =>
              setStaff((rows) => rows.map((row, i) => (i === index ? { ...row, ...next } : row)))
            return (
              <div key={index} className="space-y-2 rounded-card border border-line p-3">
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <input
                    aria-label={`A quién (pago ${index + 1})`}
                    className={fieldClass}
                    value={payment.description}
                    placeholder="Ej. ingeniero"
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                  <input
                    aria-label={`Monto (pago ${index + 1})`}
                    className={`${fieldClass} px-3 tabular-nums`}
                    inputMode="decimal"
                    value={payment.amount}
                    placeholder="$"
                    onChange={(event) =>
                      patch({ amount: event.target.value.replace(/[^\d.]/g, '') })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    selected={payment.paidWith === 'efectivo_banda'}
                    onClick={() => patch({ paidWith: 'efectivo_banda' })}
                  >
                    Con lo que cobré
                  </Chip>
                  <Chip
                    selected={payment.paidWith === 'cuenta_banda'}
                    onClick={() => patch({ paidWith: 'cuenta_banda' })}
                  >
                    Transferencia
                  </Chip>
                  <Chip
                    selected={payment.paidWith === 'pendiente'}
                    onClick={() => patch({ paidWith: 'pendiente' })}
                  >
                    Se le debe
                  </Chip>
                </div>
              </div>
            )
          })}
          <Button
            variant="secondary"
            onClick={() =>
              setStaff((rows) => [
                ...rows,
                { description: '', amount: '', paidWith: 'efectivo_banda' },
              ])
            }
          >
            ➕ Agregar un pago
          </Button>
        </section>
      </Confirm>
    </Step>
  )
}

/** Recibimos un anticipo: cuánto → dónde quedó → confirmar. */
function AnticipoFlow({ show, onDone }: { show: ShowRow; onDone: () => void }) {
  const capture = useCapture()
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState<MoneyPlace | null>(null)
  const [step, setStep] = useState<'monto' | 'destino' | 'confirmar'>('monto')

  if (step === 'monto') {
    return (
      <Step question="¿De cuánto fue el anticipo?">
        <AmountStep value={amount} onChange={setAmount} onNext={() => setStep('destino')} />
      </Step>
    )
  }
  if (step === 'destino') {
    return (
      <Step question="¿Dónde quedó?" onBack={() => setStep('monto')}>
        <div className="space-y-2">
          {INCOME_PLACE_OPTIONS.map((option) => (
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
  const payload: AnticipoPayload = { show_id: show.id, amount_cents: cents(amount), destination }
  return (
    <Step question="¿Así quedó?" onBack={() => setStep('destino')}>
      <Confirm
        text={`Recibieron ${money(cents(amount))} de anticipo por ${show.name}. Se descuenta solo al cerrar el show.`}
        onSave={() => {
          void capture('anticipo_show', payload)
          onDone()
        }}
      />
    </Step>
  )
}

// ---------------------------------------------------------------------------
// Detalle y lista
// ---------------------------------------------------------------------------
function ShowSheet({ show, onClose }: { show: ShowRow | null; onClose: () => void }) {
  const pnl = useShowPnl()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [tool, setTool] = useState<'cerrar' | 'anticipo' | 'editar' | null>(null)
  const close = () => {
    setTool(null)
    onClose()
  }
  const result = pnl.data?.find((row) => row.show_id === show?.id)
  const net = BigInt(result?.net_cents ?? 0)
  const open = show?.status === 'programado' || show?.status === 'realizado'

  const cancel = async (cancelled: boolean) => {
    if (!show) return
    const { error } = await supabase.rpc('set_show_cancelled', {
      p_show_id: show.id,
      p_cancelled: cancelled,
    })
    if (error) toast({ message: 'No se pudo. Revisa tu conexión.' })
    else {
      await queryClient.invalidateQueries()
      close()
    }
  }

  return (
    <BottomSheet
      open={show !== null}
      onOpenChange={(isOpen) => !isOpen && close()}
      title={show ? `🎸 ${show.name}` : ''}
      description={show ? `${niceDate(show.date)}${show.city ? ` · ${show.city}` : ''}` : undefined}
    >
      {show && tool === 'cerrar' && <CierreFlow show={show} onDone={close} />}
      {show && tool === 'anticipo' && <AnticipoFlow show={show} onDone={close} />}
      {show && tool === 'editar' && (
        <ShowForm
          initial={draftOf(show)}
          onSaved={() => {
            toast({ message: 'Show guardado.' })
            close()
          }}
        />
      )}
      {show && tool === null && (
        <div className="space-y-4">
          <p>
            {dealText(show)}
            {show.project?.type?.code !== 'SHW' && (
              <span className="text-ink-muted"> · {show.project?.name}</span>
            )}
          </p>
          {open && show.expected_income_cents > 0 && (
            <p className="text-ink-muted">Esperamos {money(show.expected_income_cents)}.</p>
          )}
          {show.status === 'cancelado' && (
            <p className="font-semibold text-void">Este show se canceló.</p>
          )}

          {result && (
            <section
              aria-label="Resultado del show"
              className="rounded-card border border-line bg-bg p-4"
            >
              <p className="text-ink-muted">
                {show.status === 'cerrado' ? 'Este show dejó' : 'Hasta ahora lleva'}
              </p>
              <p
                className={`display mt-1 text-5xl tabular-nums ${net > 0n ? 'text-in' : net < 0n ? 'text-danger' : ''}`}
              >
                {net >= 0n ? '+' : '−'}
                {money(net < 0n ? -net : net)}
              </p>
              <dl className="mt-3 space-y-1 text-sm tabular-nums">
                {(
                  [
                    ['Nos pagaron', result.show_income_cents],
                    ['Merch vendido', result.merch_revenue_cents],
                    ['Otros cobros', result.other_income_cents],
                    ['Costo del merch', -(result.merch_cost_cents ?? 0)],
                    ['Gastos del show', -(result.costs_cents ?? 0)],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-ink-muted">{label}</dt>
                      <dd>
                        {(value ?? 0) < 0 ? '−' : ''}
                        {money(Math.abs(value ?? 0))}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          {open && (
            <>
              <Button size="lg" block onClick={() => setTool('cerrar')}>
                🎤 Cerrar show
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setTool('anticipo')}>
                  Recibimos anticipo
                </Button>
                <Button variant="secondary" onClick={() => setTool('editar')}>
                  Editar
                </Button>
              </div>
              <Button variant="ghost" block onClick={() => void cancel(true)}>
                El show se canceló
              </Button>
            </>
          )}
          {show.status === 'cancelado' && (
            <Button variant="secondary" block onClick={() => void cancel(false)}>
              Reactivar show
            </Button>
          )}
          {show.status === 'cerrado' && (
            <p className="text-sm text-ink-muted">
              Para corregir el cierre, anúlalo en Movimientos y vuelve a cerrarlo.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

function ShowRowButton({
  show,
  net,
  onClick,
}: {
  show: ShowRow
  net?: bigint
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-control px-2 py-2 text-left active:bg-surface-2"
    >
      <span className="min-w-0">
        <span
          className={`block font-semibold ${show.status === 'cancelado' ? 'text-void line-through' : ''}`}
        >
          {show.name}
        </span>
        <span className="block text-sm text-ink-muted">
          {niceDate(show.date)}
          {show.city ? ` · ${show.city}` : ''} · {dealLabel(show.deal_type)}
        </span>
      </span>
      {net !== undefined && (
        <span
          className={`shrink-0 font-semibold tabular-nums ${net > 0n ? 'text-in' : net < 0n ? 'text-danger' : ''}`}
        >
          {net >= 0n ? '+' : '−'}
          {money(net < 0n ? -net : net)}
        </span>
      )}
    </button>
  )
}

/** Shows que ya pasaron y siguen sin cerrar. */
export function useShowsToClose(): ShowRow[] {
  const shows = useShows()
  const now = today()
  return (shows.data ?? []).filter((show) => show.status === 'programado' && show.date <= now)
}

export function ShowsPage() {
  const shows = useShows()
  const pnl = useShowPnl()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const now = today()
  const all = shows.data ?? []
  const toClose = all.filter((show) => show.status === 'programado' && show.date <= now)
  const upcoming = all.filter((show) => show.status === 'programado' && show.date > now).reverse()
  const done = all.filter((show) => show.status === 'cerrado' || show.status === 'cancelado')
  const netOf = (id: string) => BigInt(pnl.data?.find((row) => row.show_id === id)?.net_cents ?? 0)
  const section = (title: string, rows: ShowRow[], withNet: boolean) =>
    rows.length > 0 && (
      <Card>
        <h2 className="label-mono text-ink-muted">{title}</h2>
        <div className="divide-y divide-line">
          {rows.map((show) => (
            <ShowRowButton
              key={show.id}
              show={show}
              net={withNet && show.status !== 'cancelado' ? netOf(show.id) : undefined}
              onClick={() => setSelected(show.id)}
            />
          ))}
        </div>
      </Card>
    )

  return (
    <Page number="08" title="Shows">
      {shows.isPending && <p className="text-ink-muted">Afinando…</p>}
      {shows.data && all.length === 0 && (
        <EmptyState
          emoji="🎸"
          title="Todavía no hay shows"
          hint="Da de alta el próximo con su trato para cerrarlo después en segundos."
        />
      )}
      {section('Falta cerrar', toClose, false)}
      {section('Próximos', upcoming, false)}
      {section('Cerrados', done, true)}

      <Button size="lg" block onClick={() => setCreating(true)}>
        Nuevo show
      </Button>

      <BottomSheet open={creating} onOpenChange={setCreating} title="Nuevo show">
        {creating && (
          <ShowForm
            initial={newDraft()}
            onSaved={() => {
              toast({ message: 'Show guardado.' })
              setCreating(false)
            }}
          />
        )}
      </BottomSheet>
      <ShowSheet
        show={all.find((show) => show.id === selected) ?? null}
        onClose={() => setSelected(null)}
      />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Plataformas de boletaje (contador)
// ---------------------------------------------------------------------------
export function PlataformasPage() {
  const platforms = usePlatforms()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState<{
    id?: string
    name: string
    pct: string
    fixed: string
    bearer: 'publico' | 'banda'
    days: string
  } | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const { error } = await supabase.rpc('save_ticket_platform', {
        p_payload: {
          id: editing.id,
          name: editing.name.trim(),
          commission_pct: Number(editing.pct) || 0,
          commission_fixed_cents: cents(editing.fixed),
          bearer: editing.bearer,
          settlement_days: Number(editing.days) || 0,
        } as unknown as Json,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast({ message: 'Plataforma guardada.' })
      setEditing(null)
    },
  })

  return (
    <Page number="C6" title="Boleteras">
      <Card className="divide-y divide-line">
        {platforms.data?.map((platform) => (
          <button
            key={platform.id}
            type="button"
            onClick={() =>
              setEditing({
                id: platform.id,
                name: platform.name,
                pct: String(Number(platform.commission_pct)),
                fixed: toEntry(platform.commission_fixed_cents),
                bearer: platform.bearer,
                days: String(platform.settlement_days),
              })
            }
            className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] flex-col justify-center rounded-control px-2 py-2 text-left active:bg-surface-2"
          >
            <span className="font-semibold">{platform.name}</span>
            <span className="text-sm text-ink-muted">
              {Number(platform.commission_pct)} % + {money(platform.commission_fixed_cents)} por
              boleto · la paga {platform.bearer === 'banda' ? 'la banda' : 'el público'} · liquida
              en {platform.settlement_days} días
            </span>
          </button>
        ))}
      </Card>
      <Button
        size="lg"
        block
        onClick={() => setEditing({ name: '', pct: '0', fixed: '0', bearer: 'publico', days: '0' })}
      >
        Nueva boletera
      </Button>

      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Boletera"
      >
        {editing && (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (editing.name.trim()) save.mutate()
            }}
          >
            <label className="block space-y-1">
              <span className="text-sm text-ink-muted">Nombre</span>
              <input
                className={fieldClass}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1">
                <span className="text-sm text-ink-muted">Comisión %</span>
                <input
                  className={`${fieldClass} px-3 tabular-nums`}
                  inputMode="decimal"
                  value={editing.pct}
                  onChange={(event) =>
                    setEditing({ ...editing, pct: event.target.value.replace(/[^\d.]/g, '') })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-ink-muted">$ por boleto</span>
                <input
                  className={`${fieldClass} px-3 tabular-nums`}
                  inputMode="decimal"
                  value={editing.fixed}
                  onChange={(event) =>
                    setEditing({ ...editing, fixed: event.target.value.replace(/[^\d.]/g, '') })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-ink-muted">Días a liquidar</span>
                <input
                  className={`${fieldClass} px-3 tabular-nums`}
                  inputMode="numeric"
                  value={editing.days}
                  onChange={(event) =>
                    setEditing({ ...editing, days: event.target.value.replace(/\D/g, '') })
                  }
                />
              </label>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm text-ink-muted">¿Quién paga la comisión?</legend>
              <div className="flex flex-wrap gap-2">
                <Chip
                  selected={editing.bearer === 'publico'}
                  onClick={() => setEditing({ ...editing, bearer: 'publico' })}
                >
                  El público (se suma al boleto)
                </Chip>
                <Chip
                  selected={editing.bearer === 'banda'}
                  onClick={() => setEditing({ ...editing, bearer: 'banda' })}
                >
                  La banda (se nos descuenta)
                </Chip>
              </div>
            </fieldset>
            {save.error && (
              <p role="alert" className="text-danger">
                {save.error.message}
              </p>
            )}
            <Button type="submit" size="lg" block disabled={!editing.name.trim() || save.isPending}>
              Guardar
            </Button>
          </form>
        )}
      </BottomSheet>
    </Page>
  )
}
