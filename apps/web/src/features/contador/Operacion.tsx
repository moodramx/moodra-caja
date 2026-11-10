// Operación del contador (Fase 5b): sueldo del becario, repartos y su pago,
// arqueos de efectivo, pagos pendientes, reclasificaciones, asiento manual y
// cierres de mes y de año. Aquí SÍ se habla en contabilidad.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type { MoneyPlace } from '../../lib/events'
import { centsToPesos, formatMXN, pesosToCents } from '../../lib/money'
import {
  useAccounts,
  useBalances,
  useCashPosition,
  useCategories,
  useDistributionPreview,
  useDistributionsPayable,
  useFeed,
  usePeriodChecklist,
  usePeriods,
  useSettings,
  useTrialBalance,
} from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass, useCapture } from '../captura/parts'
import { ContadorOnly } from './ContadorPages'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const ORIGINS: { key: MoneyPlace; label: string }[] = [
  { key: 'cuenta_banda', label: 'Cuenta de la banda' },
  { key: 'caja', label: 'Caja' },
  { key: 'efectivo_integrante', label: 'Efectivo que traigo' },
]
const errorText = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'No se pudo guardar'
const todayInMexico = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        className={fieldClass}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function OriginChips({
  value,
  onChange,
}: {
  value: MoneyPlace
  onChange: (v: MoneyPlace) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="De dónde sale">
      {ORIGINS.map((origin) => (
        <Chip key={origin.key} selected={value === origin.key} onClick={() => onChange(origin.key)}>
          {origin.label}
        </Chip>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Operación del mes
// ---------------------------------------------------------------------------
export function OperacionPage() {
  return (
    <ContadorOnly>
      <Page number="C4" title="Operación del mes">
        <Becario />
        <Repartos />
        <Arqueo />
        <PagoPendiente />
        <Reclasificar />
      </Page>
    </ContadorOnly>
  )
}

/** Plantilla mensual: pagar el sueldo del becario con un toque. */
function Becario() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const capture = useCapture()
  const settings = useSettings()
  const categories = useCategories()
  const feed = useFeed(100)
  const [origin, setOrigin] = useState<MoneyPlace>('cuenta_banda')
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')

  const salary = settings.data?.intern_salary_cents ?? 0
  const category = categories.data?.find((c) => c.slug === 'sueldo-becario')
  const month = todayInMexico().slice(0, 7)
  const paid = (feed.data ?? []).find(
    (row) =>
      row.type === 'gasto' &&
      row.status === 'registrado' &&
      row.category_name === category?.name &&
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
        .format(new Date(row.captured_at ?? ''))
        .startsWith(month),
  )

  const saveAmount = async () => {
    const cents = pesosToCents(amount)
    if (!cents) return
    const { error } = await supabase.rpc('set_intern_salary', { p_cents: cents })
    if (error) return toast({ message: errorText(error) })
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
    setEditing(false)
  }

  return (
    <Card>
      <p className="font-semibold">🎓 Sueldo del becario</p>
      {paid ? (
        <p className="mt-1 text-in">
          Ya está pagado este mes ({formatMXN(BigInt(paid.amount_cents ?? 0))}).
        </p>
      ) : (
        <p className="mt-1 text-ink-muted">
          Falta pagar el de {MONTHS[Number(month.slice(5)) - 1]}.
        </p>
      )}
      {editing ? (
        <div className="mt-3 space-y-2">
          <AmountField label="Sueldo mensual (pesos)" value={amount} onChange={setAmount} />
          <Button block disabled={!pesosToCents(amount)} onClick={() => void saveAmount()}>
            Guardar sueldo
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <OriginChips value={origin} onChange={setOrigin} />
          <Button
            block
            disabled={!category || salary <= 0}
            onClick={() =>
              category &&
              void capture(
                'gasto',
                {
                  amount_cents: salary,
                  category_id: category.id,
                  paid_with:
                    origin === 'cuenta_banda'
                      ? 'cuenta_banda'
                      : origin === 'caja'
                        ? 'caja'
                        : 'efectivo_banda',
                  description: `Sueldo del becario de ${MONTHS[Number(month.slice(5)) - 1]}`,
                },
                'Sueldo del becario pagado ✓',
              )
            }
          >
            Pagar {formatMXN(BigInt(salary))}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setAmount(centsToPesos(salary))
              setEditing(true)
            }}
          >
            Cambiar el monto
          </Button>
        </div>
      )}
    </Card>
  )
}

/** Repartir: efectivo disponible, obligaciones, vista previa y pagos. */
function Repartos() {
  const capture = useCapture()
  const cash = useCashPosition()
  const balances = useBalances()
  const trial = useTrialBalance()
  const payable = useDistributionsPayable()
  const [amount, setAmount] = useState('')
  const [origin, setOrigin] = useState<MoneyPlace>('cuenta_banda')
  const cents = pesosToCents(amount) ?? 0
  const preview = useDistributionPreview(cents)

  const available = (cash.data ?? []).reduce((sum, row) => sum + BigInt(row.balance_cents ?? 0), 0n)
  const owed = (balances.data ?? []).reduce((sum, row) => sum + BigInt(row.owed_cents ?? 0), 0n)
  const suppliers = -BigInt(trial.data?.find((row) => row.code === '2.2')?.balance_cents ?? 0)
  const pending = (payable.data ?? []).filter((row) => (row.payable_cents ?? 0) > 0)
  const free = available - owed - (suppliers > 0n ? suppliers : 0n)

  return (
    <Card>
      <p className="font-semibold">🎉 Repartos</p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Efectivo disponible (caja, cuenta y lo que traen)</dt>
          <dd className="tabular-nums">{formatMXN(available)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Se le debe a integrantes</dt>
          <dd className="tabular-nums">{formatMXN(owed)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Pendiente con proveedores</dt>
          <dd className="tabular-nums">{formatMXN(suppliers > 0n ? suppliers : 0n)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
          <dt>Libre después de obligaciones</dt>
          <dd className={`tabular-nums ${free < 0n ? 'text-danger' : ''}`}>{formatMXN(free)}</dd>
        </div>
      </dl>

      <div className="mt-3 space-y-3">
        <AmountField label="Monto a repartir (pesos)" value={amount} onChange={setAmount} />
        {cents > 0 && BigInt(cents) > free && (
          <p className="text-sm text-pending">
            Es más de lo que queda libre: conviene dejar una reserva.
          </p>
        )}
        {preview.data && cents > 0 && (
          <table className="w-full text-sm tabular-nums" aria-label="Vista previa del reparto">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="pb-1 font-medium">Integrante</th>
                <th className="pb-1 text-right font-medium">Su parte</th>
                <th className="pb-1 text-right font-medium">+ Se le debía</th>
                <th className="pb-1 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {preview.data.map((row) => (
                <tr key={row.member_id} className="border-t border-line">
                  <td className="py-1.5">{row.display_name}</td>
                  <td className="py-1.5 text-right">{formatMXN(BigInt(row.gross_cents))}</td>
                  <td className="py-1.5 text-right">{formatMXN(BigInt(row.compensation_cents))}</td>
                  <td className="py-1.5 text-right font-semibold">
                    {formatMXN(BigInt(row.net_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Button
          block
          disabled={cents <= 0 || !preview.data?.length}
          onClick={() => {
            void capture('reparto', { amount_cents: cents }, 'Reparto registrado ✓')
            setAmount('')
          }}
        >
          Repartir
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="font-semibold">Repartos por pagar</p>
          <OriginChips value={origin} onChange={setOrigin} />
          <ul className="space-y-2">
            {pending.map((row) => (
              <li key={row.member_id} className="flex items-center justify-between gap-3">
                <span>
                  {row.emoji} {row.display_name}{' '}
                  <strong className="tabular-nums">
                    {formatMXN(BigInt(row.payable_cents ?? 0))}
                  </strong>
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void capture(
                      'pago_reparto',
                      { amount_cents: row.payable_cents ?? 0, member_id: row.member_id!, origin },
                      'Pago de reparto registrado ✓',
                    )
                  }
                >
                  Pagar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

/** Arqueo: contar la caja o el efectivo de un integrante contra lo que dicen los libros. */
function Arqueo() {
  const capture = useCapture()
  const cash = useCashPosition()
  const [target, setTarget] = useState<string>('caja')
  const [counted, setCounted] = useState('')
  const rows = (cash.data ?? []).filter((row) => row.kind !== 'banco' && row.kind !== 'cuenta')
  const options = [
    {
      key: 'caja',
      label: 'Caja',
      expected: BigInt(rows.find((r) => !r.member_id)?.balance_cents ?? 0),
    },
    ...rows
      .filter((row) => row.member_id)
      .map((row) => ({
        key: row.member_id!,
        label: row.name,
        expected: BigInt(row.balance_cents ?? 0),
      })),
  ]
  const current = options.find((option) => option.key === target) ?? options[0]!
  const cents = counted.trim() === '' ? null : pesosToCents(counted)
  const diff = cents === null ? null : BigInt(cents) - current.expected

  return (
    <Card>
      <p className="font-semibold">🧮 Arqueo de efectivo</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Qué se cuenta">
        {options.map((option) => (
          <Chip
            key={option.key}
            selected={current.key === option.key}
            onClick={() => setTarget(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Según los libros debe haber <strong>{formatMXN(current.expected)}</strong>.
      </p>
      <div className="mt-2 space-y-3">
        <AmountField label="Cuánto contaste (pesos)" value={counted} onChange={setCounted} />
        {diff !== null && (
          <p role="status" className={`font-semibold ${diff === 0n ? 'text-in' : 'text-danger'}`}>
            {diff === 0n
              ? 'Cuadra ✓'
              : diff < 0n
                ? `Faltan ${formatMXN(-diff)}`
                : `Sobran ${formatMXN(diff)}`}
          </p>
        )}
        <Button
          block
          disabled={cents === null}
          onClick={() => {
            if (cents === null) return
            void capture(
              'arqueo',
              current.key === 'caja'
                ? { place: 'caja', counted_cents: cents }
                : { place: 'efectivo_integrante', member_id: current.key, counted_cents: cents },
              'Arqueo registrado ✓',
            )
            setCounted('')
          }}
        >
          Registrar arqueo
        </Button>
      </div>
    </Card>
  )
}

/** Pagar lo que quedó pendiente con proveedores o terceros (cuenta 2.2). */
function PagoPendiente() {
  const capture = useCapture()
  const trial = useTrialBalance()
  const [amount, setAmount] = useState('')
  const [origin, setOrigin] = useState<MoneyPlace>('cuenta_banda')
  const pending = -BigInt(trial.data?.find((row) => row.code === '2.2')?.balance_cents ?? 0)
  const cents = pesosToCents(amount) ?? 0

  if (pending <= 0n) return null
  return (
    <Card>
      <p className="font-semibold">✅ Pagos pendientes a proveedores</p>
      <p className="mt-1 text-ink-muted">
        Hay <strong>{formatMXN(pending)}</strong> por pagar.
      </p>
      <div className="mt-3 space-y-3">
        <AmountField label="Monto que pagas (pesos)" value={amount} onChange={setAmount} />
        <OriginChips value={origin} onChange={setOrigin} />
        <Button
          block
          disabled={cents <= 0 || BigInt(cents) > pending}
          onClick={() => {
            void capture('pago_proveedor', { amount_cents: cents, origin }, 'Pago registrado ✓')
            setAmount('')
          }}
        >
          Registrar pago
        </Button>
      </div>
    </Card>
  )
}

/** Reclasificar: lo que se le debe a alguien pasa a aportación, o al revés. */
function Reclasificar() {
  const capture = useCapture()
  const balances = useBalances()
  const [member, setMember] = useState<string | null>(null)
  const [direction, setDirection] = useState<'a_aportacion' | 'a_prestamo'>('a_aportacion')
  const [amount, setAmount] = useState('')
  const rows = (balances.data ?? []).filter(
    (row) => (row.owed_cents ?? 0) > 0 || (row.contributions_cents ?? 0) > 0,
  )
  const current = rows.find((row) => row.member_id === member)
  const limit = BigInt(
    (direction === 'a_aportacion' ? current?.owed_cents : current?.contributions_cents) ?? 0,
  )
  const cents = pesosToCents(amount) ?? 0

  if (rows.length === 0) return null
  return (
    <Card>
      <p className="font-semibold">🔁 Reclasificar saldos</p>
      <p className="mt-1 text-sm text-ink-muted">
        Para cuando alguien decide que lo que puso ya no se le regresa (o al revés).
      </p>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Integrante">
          {rows.map((row) => (
            <Chip
              key={row.member_id}
              selected={member === row.member_id}
              onClick={() => setMember(row.member_id)}
            >
              {row.display_name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sentido">
          <Chip
            selected={direction === 'a_aportacion'}
            onClick={() => setDirection('a_aportacion')}
          >
            Lo que se le debe → aportación
          </Chip>
          <Chip selected={direction === 'a_prestamo'} onClick={() => setDirection('a_prestamo')}>
            Aportación → se le debe
          </Chip>
        </div>
        {current && (
          <p className="text-sm text-ink-muted">Disponible para mover: {formatMXN(limit)}.</p>
        )}
        <AmountField label="Monto (pesos)" value={amount} onChange={setAmount} />
        <Button
          block
          disabled={!member || cents <= 0 || BigInt(cents) > limit}
          onClick={() => {
            if (!member) return
            void capture(
              'reclasificacion',
              { amount_cents: cents, member_id: member, direction },
              'Reclasificación registrada ✓',
            )
            setAmount('')
          }}
        >
          Reclasificar
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Asiento manual
// ---------------------------------------------------------------------------
interface Line {
  account: string
  debit: string
  credit: string
}
const emptyLine: Line = { account: '', debit: '', credit: '' }

export function AsientoPage() {
  const capture = useCapture()
  const accounts = useAccounts()
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine, emptyLine])
  const postable = (accounts.data ?? []).filter((a) => a.is_postable && a.active)

  const parsed = lines.map((line) => ({
    account: line.account,
    debit: pesosToCents(line.debit),
    credit: pesosToCents(line.credit),
  }))
  const debit = parsed.reduce((sum, line) => sum + (line.debit ?? 0), 0)
  const credit = parsed.reduce((sum, line) => sum + (line.credit ?? 0), 0)
  const filled = parsed.filter(
    (line) => line.account && ((line.debit ?? 0) > 0 || (line.credit ?? 0) > 0),
  )
  const problem =
    reason.trim().length < 5
      ? 'Explica el motivo (mínimo 5 letras)'
      : parsed.some((line) => line.debit === null || line.credit === null)
        ? 'Revisa los montos'
        : filled.length < 2
          ? 'Captura al menos dos renglones'
          : filled.some((line) => (line.debit ?? 0) > 0 && (line.credit ?? 0) > 0)
            ? 'Cada renglón lleva cargo o abono, no ambos'
            : debit !== credit
              ? `No cuadra: cargos ${formatMXN(BigInt(debit))} ≠ abonos ${formatMXN(BigInt(credit))}`
              : null

  const patch = (index: number, change: Partial<Line>) =>
    setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)))

  return (
    <ContadorOnly>
      <Page number="C5" title="Asiento manual">
        <Card>
          <p className="text-sm text-ink-muted">
            Para casos raros que ninguna captura cubre (comisiones del banco, ajustes). Queda
            marcado como manual y se puede anular desde Movimientos.
          </p>
          <label className="mt-3 block">
            <span className="text-sm text-ink-muted">Motivo</span>
            <input
              className={fieldClass}
              placeholder="Comisión del banco de noviembre"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="mt-3 space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="space-y-2 rounded-card border border-line bg-bg p-3">
                <label className="block">
                  <span className="text-sm text-ink-muted">Cuenta del renglón {index + 1}</span>
                  <select
                    className={fieldClass}
                    value={line.account}
                    onChange={(event) => patch(index, { account: event.target.value })}
                  >
                    <option value="">Elige una cuenta…</option>
                    {postable.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm text-ink-muted">Cargo {index + 1}</span>
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.debit}
                      onChange={(event) => patch(index, { debit: event.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-ink-muted">Abono {index + 1}</span>
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      placeholder="0"
                      value={line.credit}
                      onChange={(event) => patch(index, { credit: event.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}
            <Button variant="secondary" block onClick={() => setLines([...lines, emptyLine])}>
              Agregar renglón
            </Button>
          </div>
          <p
            role="status"
            className={`mt-3 font-semibold ${problem ? 'text-ink-muted' : 'text-in'}`}
          >
            {problem ?? `Cuadra ✓ · ${formatMXN(BigInt(debit))}`}
          </p>
          <Button
            size="lg"
            block
            className="mt-3"
            disabled={Boolean(problem)}
            onClick={() => {
              void capture(
                'asiento_manual',
                {
                  reason: reason.trim(),
                  lines: filled.map((line) => ({
                    account_id: line.account,
                    debit_cents: line.debit ?? 0,
                    credit_cents: line.credit ?? 0,
                  })),
                },
                'Asiento registrado ✓',
              )
              setReason('')
              setLines([emptyLine, emptyLine])
            }}
          >
            Registrar asiento
          </Button>
        </Card>
      </Page>
    </ContadorOnly>
  )
}

// ---------------------------------------------------------------------------
// Cierres de mes y de año
// ---------------------------------------------------------------------------
export function CierresPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const periods = usePeriods()
  const [selected, setSelected] = useState<{ year: number; month: number } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const checklist = usePeriodChecklist(selected?.year ?? null, selected?.month ?? null)
  const check = (checklist.data ?? null) as {
    status: string
    ended: boolean
    shows_sin_cerrar: number
    entregas_sin_confirmar: number
    arqueos: number
    asientos: number
  } | null

  const today = todayInMexico()
  const thisYear = Number(today.slice(0, 4))
  const lastYear = thisYear - 1
  const rows = periods.data ?? []
  const lastYearClosed = rows.some((row) => row.year === lastYear && row.year_closed)
  const lastYearHasData = rows.some((row) => row.year === lastYear && (row.entries ?? 0) > 0)

  const run = async (job: PromiseLike<{ error: unknown }>, done: string) => {
    setBusy(true)
    const { error } = await job
    setBusy(false)
    if (error) return toast({ message: errorText(error) })
    await queryClient.invalidateQueries()
    setReason('')
    toast({ message: done })
  }

  return (
    <ContadorOnly>
      <Page number="C6" title="Cierres">
        <Card>
          <p className="font-semibold">Meses</p>
          <p className="mt-1 text-sm text-ink-muted">
            Un mes cerrado ya no recibe registros: lo que se capture con esa fecha entra con la
            fecha de hoy y queda avisado.
          </p>
          <ul className="mt-2 divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 text-left"
                  aria-expanded={selected?.year === row.year && selected?.month === row.month}
                  onClick={() =>
                    setSelected(
                      selected?.year === row.year && selected?.month === row.month
                        ? null
                        : { year: row.year!, month: row.month! },
                    )
                  }
                >
                  <span className="font-semibold">
                    {MONTHS[(row.month ?? 1) - 1]} {row.year}
                  </span>
                  <span className={row.status === 'cerrado' ? 'text-ink-muted' : 'text-in'}>
                    {row.status === 'cerrado' ? '🔒 cerrado' : 'abierto'} · {row.entries} asientos
                  </span>
                </button>
                {selected?.year === row.year && selected?.month === row.month && check && (
                  <div className="space-y-3 pb-4">
                    <ul className="space-y-1 text-sm">
                      <li>
                        {check.shows_sin_cerrar === 0 ? '✓' : '⚠️'} Shows sin cerrar:{' '}
                        {check.shows_sin_cerrar}
                      </li>
                      <li>
                        {check.entregas_sin_confirmar === 0 ? '✓' : '⚠️'} Entregas sin confirmar:{' '}
                        {check.entregas_sin_confirmar}
                      </li>
                      <li>
                        {check.arqueos > 0 ? '✓' : '⚠️'} Arqueos de efectivo en el mes:{' '}
                        {check.arqueos}
                      </li>
                    </ul>
                    {row.status === 'abierto' ? (
                      <Button
                        block
                        disabled={busy || !check.ended}
                        onClick={() =>
                          void run(
                            supabase.rpc('close_period', {
                              p_year: row.year!,
                              p_month: row.month!,
                            }),
                            'Mes cerrado ✓',
                          )
                        }
                      >
                        {check.ended ? 'Cerrar el mes' : 'Este mes todavía no termina'}
                      </Button>
                    ) : row.year_closed ? (
                      <p className="text-sm text-ink-muted">
                        El año ya está cerrado; este mes no se reabre.
                      </p>
                    ) : (
                      <>
                        <label className="block">
                          <span className="text-sm text-ink-muted">Motivo para reabrir</span>
                          <input
                            className={fieldClass}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>
                        <Button
                          variant="secondary"
                          block
                          disabled={busy || reason.trim().length < 5}
                          onClick={() =>
                            void run(
                              supabase.rpc('reopen_period', {
                                p_year: row.year!,
                                p_month: row.month!,
                                p_reason: reason,
                              }),
                              'Mes reabierto',
                            )
                          }
                        >
                          Reabrir el mes
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="mt-2 text-ink-muted">Todavía no hay meses con registros.</p>
          )}
        </Card>

        <Card>
          <p className="font-semibold">Cierre de año</p>
          <p className="mt-1 text-sm text-ink-muted">
            Pasa el resultado del año a resultados acumulados, con fecha 31 de diciembre. Antes hay
            que cerrar todos sus meses.
          </p>
          {lastYearClosed ? (
            <p className="mt-2 text-in">El año {lastYear} ya está cerrado ✓</p>
          ) : lastYearHasData ? (
            <Button
              block
              className="mt-3"
              disabled={busy || profile?.role !== 'contador'}
              onClick={() =>
                void run(
                  supabase.rpc('close_year', { p_year: lastYear }),
                  `Año ${lastYear} cerrado ✓`,
                )
              }
            >
              Cerrar el año {lastYear}
            </Button>
          ) : (
            <p className="mt-2 text-ink-muted">
              El año {thisYear} se podrá cerrar a partir del 1 de enero de {thisYear + 1}.
            </p>
          )}
        </Card>
      </Page>
    </ContadorOnly>
  )
}
