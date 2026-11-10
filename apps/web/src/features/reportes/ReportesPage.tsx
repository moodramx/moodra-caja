// Reportes. En modo banda: un resumen en palabras de todos los días. En modo
// contador: tablero, alertas y los reportes formales con descarga a Excel y PDF.
import { useMemo, useState } from 'react'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { cellText, downloadExcel, downloadPdf, fileName } from '../../lib/export'
import { useMode } from '../../lib/mode'
import { formatMXNShort } from '../../lib/money'
import {
  useAccountTotals,
  useAlerts,
  useBalances,
  useCashFlow,
  useLedger,
  useMerchReport,
  useShowReport,
} from '../../lib/queries'
import {
  balanceOf,
  buildBalanceSheet,
  buildBreakEven,
  buildCashFlow,
  buildIncomeStatement,
  buildInventory,
  buildLedger,
  buildMemberBalances,
  buildMerchMargin,
  buildShowRanking,
  buildTrialBalance,
  cashOf,
  dayBefore,
  periodOf,
  resultOf,
  type AccountTotal,
  type Period,
  type PeriodKind,
  type Report,
} from '../../lib/reports'

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'mes', label: 'Este mes' },
  { kind: 'mes_pasado', label: 'Mes pasado' },
  { kind: 'anio', label: 'Este año' },
  { kind: 'todo', label: 'Todo' },
]

const todayInMexico = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n)
const sumOf = (rows: AccountTotal[], test: (row: AccountTotal) => boolean) =>
  sum(rows.filter(test).map(balanceOf))

/** Todo lo que necesitan los reportes de un periodo. */
function useReportData(period: Period) {
  const movement = useAccountTotals(period.from, period.to)
  const cumulative = useAccountTotals(null, period.to)
  const opening = useAccountTotals(
    null,
    period.from ? dayBefore(period.from) : null,
    period.from !== null,
  )
  const previous = useAccountTotals(
    period.previous?.from ?? null,
    period.previous?.to ?? null,
    period.previous !== undefined,
  )
  const flows = useCashFlow(period.from, period.to)
  const merch = useMerchReport(period.from, period.to)
  const shows = useShowReport()
  const members = useBalances()

  return {
    ready: Boolean(
      movement.data && cumulative.data && flows.data && (period.from === null || opening.data),
    ),
    failed: movement.isError || cumulative.isError || flows.isError,
    movement: movement.data ?? [],
    cumulative: cumulative.data ?? [],
    opening: period.from === null ? [] : (opening.data ?? []),
    previous: period.previous ? previous.data : undefined,
    flows: flows.data ?? [],
    merch: merch.data ?? [],
    shows: shows.data ?? [],
    members: members.data ?? [],
  }
}
type ReportData = ReturnType<typeof useReportData>

export function ReportesPage() {
  const { contadorMode } = useMode()
  const [kind, setKind] = useState<PeriodKind>('mes')
  // Los reportes financieros son para todos; quien no anda en Modo contador
  // empieza en el resumen y los abre cuando quiere.
  const [full, setFull] = useState(false)
  const showFull = contadorMode || full
  const period = useMemo(() => periodOf(kind, todayInMexico()), [kind])
  const data = useReportData(period)

  return (
    <Page number="04" title="Reportes">
      {!contadorMode && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Vista">
          <Chip selected={!full} onClick={() => setFull(false)}>
            Resumen
          </Chip>
          <Chip selected={full} onClick={() => setFull(true)}>
            Reportes financieros
          </Chip>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
        {PERIODS.map((option) => (
          <Chip
            key={option.kind}
            selected={kind === option.kind}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
      {data.failed && !data.ready && (
        <EmptyState
          emoji="📡"
          title="No se pudo cargar"
          hint="Revisa tu señal y vuelve a intentar."
        />
      )}
      {!data.ready && !data.failed && <p className="text-ink-muted">Afinando…</p>}
      {data.ready &&
        (showFull ? (
          <ContadorView period={period} data={data} />
        ) : (
          <BandView period={period} data={data} />
        ))}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Modo banda: sin palabras de contabilidad
// ---------------------------------------------------------------------------
function Bars({ rows }: { rows: { name: string; amount: bigint }[] }) {
  const top = [...rows].sort((a, b) => (b.amount > a.amount ? 1 : -1)).slice(0, 6)
  const max = top[0]?.amount ?? 0n
  return (
    <ul className="mt-3 space-y-2.5">
      {top.map((row) => (
        <li key={row.name}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{row.name}</span>
            <span className="font-semibold tabular-nums">{formatMXNShort(row.amount)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full bg-ink"
              style={{ width: `${max > 0n ? Math.max(Number((row.amount * 100n) / max), 2) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function BandView({ period, data }: { period: Period; data: ReportData }) {
  const earned = sumOf(data.movement, (r) => r.type === 'ingreso')
  const spent = sumOf(data.movement, (r) => ['costo', 'gasto', 'otro'].includes(r.type))
  const left = earned - spent
  const byName = (types: AccountTotal['type'][]) =>
    data.movement
      .filter((r) => types.includes(r.type) && balanceOf(r) > 0n)
      .map((r) => ({ name: r.name, amount: balanceOf(r) }))
  const income = byName(['ingreso'])
  const expenses = byName(['costo', 'gasto', 'otro'])
  const shows = buildShowRanking(data.shows, period).rows.filter((row) => !row.kind)

  if (earned === 0n && spent === 0n) {
    return (
      <EmptyState
        emoji="📈"
        title="Todavía no hay números"
        hint={`No hay nada registrado en ${period.label}.`}
      />
    )
  }

  return (
    <>
      <Card>
        <p className="label-mono text-ink-muted">Cómo nos fue · {period.label}</p>
        <p
          className={`display mt-2 text-4xl tabular-nums ${left < 0n ? 'text-danger' : 'text-in'}`}
        >
          {formatMXNShort(left)}
        </p>
        <p className="mt-1 text-ink-muted">
          {left < 0n ? 'Gastamos más de lo que ganamos.' : 'Nos quedó a favor.'}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
          <div>
            <dt className="text-sm text-ink-muted">Ganamos</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatMXNShort(earned)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Gastamos</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatMXNShort(spent)}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <p className="label-mono text-ink-muted">Dinero de la banda hoy</p>
        <p className="display mt-2 text-3xl tabular-nums">
          {formatMXNShort(cashOf(data.cumulative))}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Entre la cuenta, la caja y lo que trae cada quien.
        </p>
      </Card>
      {income.length > 0 && (
        <Card>
          <p className="font-semibold">De dónde entró</p>
          <Bars rows={income} />
        </Card>
      )}
      {expenses.length > 0 && (
        <Card>
          <p className="font-semibold">En qué se fue</p>
          <Bars rows={expenses} />
        </Card>
      )}
      {shows.length > 0 && (
        <Card>
          <p className="font-semibold">Lo que dejó cada show</p>
          <ul className="mt-2 divide-y divide-line">
            {shows.map((row) => {
              const net = row.cells[4] as bigint
              return (
                <li key={String(row.cells[0])} className="flex justify-between gap-3 py-2">
                  <span>{row.cells[0]}</span>
                  <span
                    className={`font-semibold tabular-nums ${net < 0n ? 'text-danger' : 'text-in'}`}
                  >
                    {formatMXNShort(net)}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Modo contador
// ---------------------------------------------------------------------------
type ReportKey =
  | 'resultados'
  | 'balance'
  | 'flujo'
  | 'balanza'
  | 'auxiliar'
  | 'integrantes'
  | 'shows'
  | 'equilibrio'
  | 'margen'
  | 'inventario'
const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'resultados', label: 'Resultados' },
  { key: 'balance', label: 'Balance' },
  { key: 'flujo', label: 'Flujo de efectivo' },
  { key: 'balanza', label: 'Balanza' },
  { key: 'auxiliar', label: 'Auxiliar' },
  { key: 'integrantes', label: 'Integrantes' },
  { key: 'shows', label: 'Shows' },
  { key: 'equilibrio', label: 'Punto de equilibrio' },
  { key: 'margen', label: 'Margen de merch' },
  { key: 'inventario', label: 'Inventario' },
]

const ALERT_EMOJI: Record<string, string> = {
  stock_negativo: '🚨',
  stock_bajo: '📦',
  entrega_sin_confirmar: '🤝',
  show_sin_cerrar: '🎤',
  registro_en_mes_cerrado: '🔒',
}
function alertText(alert: { kind: string | null; title: string | null; amount: number | null }) {
  switch (alert.kind) {
    case 'stock_negativo':
      return `${alert.title}: existencias en negativo (${alert.amount})`
    case 'stock_bajo':
      return `${alert.title}: ${alert.amount === 0 ? 'se acabó' : `quedan ${alert.amount}`}`
    case 'entrega_sin_confirmar':
      return `Entrega de ${formatMXNShort(BigInt(alert.amount ?? 0))} sin confirmar desde hace más de 2 días`
    case 'show_sin_cerrar':
      return `${alert.title}: ya pasó y falta cerrarlo`
    default:
      return alert.title ?? ''
  }
}

function Stat({ label, value, tone }: { label: string; value: bigint; tone?: 'signed' }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="text-sm text-ink-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === 'signed' ? (value < 0n ? 'text-danger' : 'text-in') : ''
        }`}
      >
        {formatMXNShort(value)}
      </p>
    </div>
  )
}

function ReportTable({ report }: { report: Report }) {
  return (
    <div className="-mx-4 mt-3 overflow-x-auto px-4">
      <table
        className={`w-full text-sm tabular-nums ${report.columns.length > 3 ? 'min-w-[640px]' : ''}`}
      >
        <thead>
          <tr className="text-left text-ink-muted">
            {report.columns.map((column, i) => (
              <th key={i} className={`pb-1 font-medium ${i > 0 ? 'pl-3 text-right' : ''}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, r) => (
            <tr
              key={r}
              className={
                row.kind === 'grand'
                  ? 'border-t-2 border-ink font-semibold'
                  : row.kind === 'total'
                    ? 'border-t border-line font-semibold'
                    : row.kind === 'section'
                      ? 'label-mono text-ink-muted'
                      : 'border-t border-line align-top'
              }
            >
              {report.columns.map((_, i) => {
                const cell = row.cells[i]
                return (
                  <td
                    key={i}
                    className={`${row.kind === 'section' ? 'pt-4 pb-1' : 'py-1.5'} ${
                      i > 0 ? 'pl-3 text-right whitespace-nowrap' : 'pr-2'
                    } ${typeof cell === 'bigint' && cell < 0n ? 'text-danger' : ''}`}
                  >
                    {cellText(cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ContadorView({ period, data }: { period: Period; data: ReportData }) {
  const { toast } = useToast()
  const alerts = useAlerts()
  const [selected, setSelected] = useState<ReportKey>('resultados')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const accounts = useMemo(
    () =>
      [...data.cumulative].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true }),
      ),
    [data.cumulative],
  )
  const account = accounts.find((a) => a.account_id === accountId) ?? accounts[0]
  const ledger = useLedger(
    selected === 'auxiliar' ? (account?.account_id ?? null) : null,
    period.from,
    period.to,
  )

  const asOf = period.to ? `al ${period.to}` : 'con todo lo registrado'
  const openingCash = cashOf(data.opening)
  const balance = buildBalanceSheet(data.cumulative, asOf)
  const flow = buildCashFlow(data.flows, openingCash, period.label)
  const trial = buildTrialBalance(data.opening, data.movement, period.label)

  const built: Record<Exclude<ReportKey, 'auxiliar'>, Report> = {
    resultados: buildIncomeStatement(
      data.movement,
      period.label,
      period.previous && data.previous
        ? { rows: data.previous, label: period.previous.label }
        : undefined,
    ),
    balance: balance.report,
    flujo: flow.report,
    balanza: trial,
    integrantes: buildMemberBalances(data.members, 'al día de hoy'),
    shows: buildShowRanking(data.shows, period),
    equilibrio: buildBreakEven(data.shows, period),
    margen: buildMerchMargin(data.merch, period.label),
    inventario: buildInventory(data.merch, period.label),
  }
  const ledgerReport =
    account && ledger.data
      ? buildLedger(
          account,
          ledger.data,
          balanceOf(
            data.opening.find((row) => row.code === account.code) ?? {
              ...account,
              debit_cents: 0,
              credit_cents: 0,
            },
          ),
          period.label,
        )
      : null
  const report = selected === 'auxiliar' ? ledgerReport : built[selected]

  const trialSums = trial.rows.at(-1)?.cells
  const checks: Partial<Record<ReportKey, { ok: boolean; yes: string; no: string }>> = {
    balance: {
      ok: balance.assets === balance.liabilitiesAndEquity,
      yes: 'Activo = Pasivo + Fondo ✓',
      no: 'El balance NO cuadra',
    },
    flujo: {
      ok: flow.closing === cashOf(data.cumulative),
      yes: 'El flujo cuadra con caja, bancos y efectivo ✓',
      no: 'El flujo NO cuadra con caja y bancos',
    },
    balanza: {
      ok: trialSums?.[2] === trialSums?.[3],
      yes: 'La balanza cuadra ✓',
      no: 'La balanza NO cuadra',
    },
  }
  const check = checks[selected]

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try {
      await job()
    } catch {
      toast({ message: 'No se pudo generar el archivo. Intenta de nuevo.' })
    } finally {
      setBusy(false)
    }
  }
  const everything = [...Object.values(built), ...(ledgerReport ? [ledgerReport] : [])]

  return (
    <>
      <section aria-label="Tablero" className="grid grid-cols-2 gap-3">
        <Stat label="Dinero de la banda" value={cashOf(data.cumulative)} />
        <Stat label={`Resultado · ${period.label}`} value={resultOf(data.movement)} tone="signed" />
        <Stat label="Por cobrar" value={sumOf(data.cumulative, (r) => r.code.startsWith('1.3'))} />
        <Stat label="Por pagar" value={sumOf(data.cumulative, (r) => r.type === 'pasivo')} />
        <Stat
          label="Inventario de merch"
          value={sumOf(data.cumulative, (r) => r.code.startsWith('1.4'))}
        />
        <Stat
          label="Fondo Moodra"
          value={sumOf(data.cumulative, (r) => r.type === 'patrimonio') + resultOf(data.cumulative)}
        />
      </section>

      <Card>
        <p className="font-semibold">Alertas</p>
        {alerts.data?.length === 0 && <p className="mt-1 text-ink-muted">Todo en orden.</p>}
        <ul className="mt-2 space-y-2">
          {alerts.data?.map((alert, i) => (
            <li key={`${alert.kind}-${alert.ref}-${i}`} className="flex gap-2 text-sm">
              <span aria-hidden="true">{ALERT_EMOJI[alert.kind ?? ''] ?? '⚠️'}</span>
              <span>{alertText(alert)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Reporte">
        {REPORTS.map((option) => (
          <Chip
            key={option.key}
            selected={selected === option.key}
            onClick={() => setSelected(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <Card>
        {selected === 'auxiliar' && (
          <label className="mb-3 block">
            <span className="text-sm text-ink-muted">Cuenta</span>
            <select
              className="mt-1 block min-h-12 w-full rounded-xl border border-line bg-bg px-3"
              value={account?.account_id ?? ''}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!report && (
          <p className="text-ink-muted">
            {accounts.length === 0 ? 'Sin movimientos.' : 'Afinando…'}
          </p>
        )}
        {report && (
          <>
            <h2 className="text-lg font-semibold">{report.title}</h2>
            <p className="text-sm text-ink-muted">{report.subtitle}</p>
            {check && (
              <p
                role="status"
                className={`mt-2 font-semibold ${check.ok ? 'text-in' : 'text-danger'}`}
              >
                {check.ok ? check.yes : check.no}
              </p>
            )}
            {report.rows.length === 0 ? (
              <p className="mt-3 text-ink-muted">Nada que mostrar en {period.label}.</p>
            ) : (
              <ReportTable report={report} />
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => downloadExcel([report], fileName(`${report.title} ${report.subtitle}`)))
                }
              >
                Excel
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => downloadPdf([report], fileName(`${report.title} ${report.subtitle}`)))
                }
              >
                PDF
              </Button>
            </div>
          </>
        )}
      </Card>

      <Button
        block
        disabled={busy}
        onClick={() => run(() => downloadExcel(everything, fileName(`reportes ${period.label}`)))}
      >
        {busy ? 'Generando…' : 'Descargar todos en Excel'}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Saldos por integrante e inventario son al día de hoy; lo demás, de {period.label}.
      </p>
    </>
  )
}
