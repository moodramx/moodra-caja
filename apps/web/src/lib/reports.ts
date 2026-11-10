// Armado de reportes a partir de las consultas de la base. Todo es lógica pura:
// recibe renglones y devuelve una tabla lista para pantalla, Excel o PDF.

export interface AccountTotal {
  code: string
  name: string
  type: 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto' | 'otro'
  nature: 'deudora' | 'acreedora'
  debit_cents: number
  credit_cents: number
}

export type Cell = string | bigint | number | null
export interface ReportRow {
  cells: Cell[]
  /** section: encabezado de grupo · total: subtotal · grand: total final. */
  kind?: 'section' | 'total' | 'grand'
}
export interface Report {
  title: string
  subtitle: string
  /** La primera columna es texto; las demás son dinero (bigint) o texto/números. */
  columns: string[]
  rows: ReportRow[]
}

/** Saldo de una cuenta según su naturaleza (positivo = saldo normal). */
export const balanceOf = (t: AccountTotal): bigint =>
  t.nature === 'deudora'
    ? BigInt(t.debit_cents) - BigInt(t.credit_cents)
    : BigInt(t.credit_cents) - BigInt(t.debit_cents)

/**
 * Saldo según el grupo al que pertenece la cuenta (activo, costo, gasto y otros
 * suman con cargos; pasivo, fondo e ingresos, con abonos). Una cuenta que va al
 * revés de su grupo —"Repartos a integrantes" dentro del fondo— sale negativa
 * y resta, que es lo correcto en el balance y en los resultados.
 */
export const groupBalance = (t: AccountTotal): bigint =>
  ['activo', 'costo', 'gasto', 'otro'].includes(t.type)
    ? BigInt(t.debit_cents) - BigInt(t.credit_cents)
    : BigInt(t.credit_cents) - BigInt(t.debit_cents)

const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, undefined, { numeric: true })
const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n)
const ofType = (rows: AccountTotal[], ...types: AccountTotal['type'][]) =>
  rows.filter((row) => types.includes(row.type) && groupBalance(row) !== 0n).sort(byCode)

/** Resultado del periodo: ingresos − costos − gastos − otros. */
export function resultOf(rows: AccountTotal[]): bigint {
  return (
    sum(rows.filter((r) => r.type === 'ingreso').map(groupBalance)) -
    sum(rows.filter((r) => ['costo', 'gasto', 'otro'].includes(r.type)).map(groupBalance))
  )
}

// ---------------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------------
export type PeriodKind = 'mes' | 'mes_pasado' | 'anio' | 'todo'
export interface Period {
  kind: PeriodKind
  label: string
  from: string | null
  to: string | null
  /** Periodo anterior comparable (solo para meses). */
  previous?: { label: string; from: string; to: string }
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
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

/** Rango de fechas de un periodo, en hora de México. `today` es AAAA-MM-DD. */
export function periodOf(kind: PeriodKind, today: string): Period {
  const [year, month] = today.split('-').map(Number) as [number, number]
  const monthRange = (y: number, m: number) => ({
    label: `${MONTHS[m - 1]} ${y}`,
    from: iso(y, m, 1),
    to: iso(y, m, lastDay(y, m)),
  })
  const back = (y: number, m: number): [number, number] => (m === 1 ? [y - 1, 12] : [y, m - 1])

  if (kind === 'mes')
    return { kind, ...monthRange(year, month), previous: monthRange(...back(year, month)) }
  if (kind === 'mes_pasado') {
    const [y, m] = back(year, month)
    return { kind, ...monthRange(y, m), previous: monthRange(...back(y, m)) }
  }
  if (kind === 'anio')
    return { kind, label: `año ${year}`, from: iso(year, 1, 1), to: iso(year, 12, 31) }
  return { kind, label: 'todo el historial', from: null, to: null }
}

/** Día anterior a una fecha AAAA-MM-DD. */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Estado de resultados
// ---------------------------------------------------------------------------
export function buildIncomeStatement(
  rows: AccountTotal[],
  period: string,
  previous?: { rows: AccountTotal[]; label: string },
): Report {
  const prevOf = (code: string) => {
    const found = previous?.rows.find((row) => row.code === code)
    return found ? groupBalance(found) : 0n
  }
  const all = previous
    ? [...rows, ...previous.rows.filter((p) => !rows.some((r) => r.code === p.code))]
    : rows
  const out: ReportRow[] = []
  const cells = (label: string, now: bigint, before: bigint): Cell[] =>
    previous ? [label, now, before] : [label, now]

  const group = (title: string, ...types: AccountTotal['type'][]) => {
    const accounts = ofType(all, ...types)
    const current = (code: string) => {
      const found = rows.find((row) => row.code === code)
      return found ? groupBalance(found) : 0n
    }
    out.push({ cells: [title], kind: 'section' })
    for (const account of accounts) {
      out.push({
        cells: cells(
          `${account.code} ${account.name}`,
          current(account.code),
          prevOf(account.code),
        ),
      })
    }
    const total = sum(accounts.map((a) => current(a.code)))
    const totalPrev = sum(accounts.map((a) => prevOf(a.code)))
    out.push({ cells: cells(`Total ${title.toLowerCase()}`, total, totalPrev), kind: 'total' })
    return [total, totalPrev] as const
  }

  const [income, incomePrev] = group('Ingresos', 'ingreso')
  const [costs, costsPrev] = group('Costos directos', 'costo')
  out.push({
    cells: cells('Utilidad bruta', income - costs, incomePrev - costsPrev),
    kind: 'total',
  })
  const [expenses, expensesPrev] = group('Gastos de operación', 'gasto')
  const [other, otherPrev] = group('Otros', 'otro')
  out.push({
    cells: cells(
      'Resultado',
      income - costs - expenses - other,
      incomePrev - costsPrev - expensesPrev - otherPrev,
    ),
    kind: 'grand',
  })

  return {
    title: 'Estado de resultados',
    subtitle: period,
    columns: previous ? ['Concepto', period, previous.label] : ['Concepto', period],
    rows: out,
  }
}

// ---------------------------------------------------------------------------
// Balance general (con todo lo registrado hasta la fecha)
// ---------------------------------------------------------------------------
export function buildBalanceSheet(rows: AccountTotal[], asOf: string) {
  const out: ReportRow[] = []
  const group = (title: string, type: AccountTotal['type']) => {
    const accounts = ofType(rows, type)
    out.push({ cells: [title], kind: 'section' })
    for (const account of accounts)
      out.push({ cells: [`${account.code} ${account.name}`, groupBalance(account)] })
    return sum(accounts.map(groupBalance))
  }

  const assets = group('Activo', 'activo')
  out.push({ cells: ['Total activo', assets], kind: 'grand' })
  const liabilities = group('Pasivo', 'pasivo')
  out.push({ cells: ['Total pasivo', liabilities], kind: 'total' })
  const equity = group('Fondo Moodra', 'patrimonio')
  const result = resultOf(rows)
  out.push({ cells: ['Resultado acumulado (sin cerrar)', result] })
  out.push({ cells: ['Total fondo', equity + result], kind: 'total' })
  out.push({ cells: ['Total pasivo + fondo', liabilities + equity + result], kind: 'grand' })

  return {
    report: {
      title: 'Balance general',
      subtitle: asOf,
      columns: ['Cuenta', 'Saldo'],
      rows: out,
    } satisfies Report,
    assets,
    liabilitiesAndEquity: liabilities + equity + result,
  }
}

// ---------------------------------------------------------------------------
// Flujo de efectivo (método directo)
// ---------------------------------------------------------------------------
export interface CashFlowRow {
  kind: string
  detail: string
  inflow_cents: number
  outflow_cents: number
  net_cents: number
}

const FLOW_LABEL: Record<string, string> = {
  venta_merch: 'Venta de merch',
  compra_merch: 'Compra de merch',
  puse_dinero: 'Dinero que pusieron integrantes',
  regreso_dinero: 'Dinero regresado a integrantes',
  pago_proveedor: 'Pagos de lo que se debía',
  cierre_show: 'Cobros de shows',
  anticipo_show: 'Anticipos de shows',
  cobro_pendiente: 'Cobranza de pendientes',
  manual: 'Asientos manuales',
}
const flowLabel = (row: CashFlowRow) =>
  row.kind === 'gasto'
    ? `Gastos: ${row.detail || 'otros'}`
    : row.kind === 'ingreso'
      ? `Cobros: ${row.detail || 'otros'}`
      : (FLOW_LABEL[row.kind] ?? row.kind)

export function buildCashFlow(rows: CashFlowRow[], openingCents: bigint, period: string) {
  const merged = new Map<string, bigint>()
  for (const row of rows)
    merged.set(flowLabel(row), (merged.get(flowLabel(row)) ?? 0n) + BigInt(row.net_cents))
  const entries = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const inflows = entries.filter(([, net]) => net > 0n)
  const outflows = entries.filter(([, net]) => net < 0n)
  const totalIn = sum(inflows.map(([, net]) => net))
  const totalOut = sum(outflows.map(([, net]) => -net))
  const change = totalIn - totalOut

  const out: ReportRow[] = [
    { cells: ['Dinero al inicio', openingCents], kind: 'total' },
    { cells: ['Entradas'], kind: 'section' },
    ...inflows.map(([label, net]) => ({ cells: [label, net] as Cell[] })),
    { cells: ['Total entradas', totalIn], kind: 'total' },
    { cells: ['Salidas'], kind: 'section' },
    ...outflows.map(([label, net]) => ({ cells: [label, -net] as Cell[] })),
    { cells: ['Total salidas', totalOut], kind: 'total' },
    { cells: ['Cambio en el periodo', change], kind: 'total' },
    { cells: ['Dinero al final', openingCents + change], kind: 'grand' },
  ]
  return {
    report: {
      title: 'Flujo de efectivo',
      subtitle: period,
      columns: ['Concepto', 'Monto'],
      rows: out,
    } satisfies Report,
    change,
    closing: openingCents + change,
  }
}

/** Dinero de la banda: caja, bancos y efectivo en manos de integrantes (cuentas 1.1 y 1.2). */
export function cashOf(rows: AccountTotal[]): bigint {
  return sum(
    rows.filter((r) => r.code.startsWith('1.1') || r.code.startsWith('1.2')).map(balanceOf),
  )
}

// ---------------------------------------------------------------------------
// Balanza de comprobación
// ---------------------------------------------------------------------------
export function buildTrialBalance(
  opening: AccountTotal[],
  movement: AccountTotal[],
  period: string,
): Report {
  const codes = [...new Set([...opening, ...movement].map((row) => row.code))]
  const accounts = codes
    .map((code) => {
      const open = opening.find((row) => row.code === code)
      const move = movement.find((row) => row.code === code)
      const base = (move ?? open)!
      const initial = open ? balanceOf(open) : 0n
      const debit = BigInt(move?.debit_cents ?? 0)
      const credit = BigInt(move?.credit_cents ?? 0)
      const final = initial + (base.nature === 'deudora' ? debit - credit : credit - debit)
      return { code, name: base.name, initial, debit, credit, final }
    })
    .filter((a) => a.initial !== 0n || a.debit !== 0n || a.credit !== 0n)
    .sort(byCode)

  return {
    title: 'Balanza de comprobación',
    subtitle: period,
    columns: ['Cuenta', 'Saldo inicial', 'Cargos', 'Abonos', 'Saldo final'],
    rows: [
      ...accounts.map((a) => ({
        cells: [`${a.code} ${a.name}`, a.initial, a.debit, a.credit, a.final] as Cell[],
      })),
      {
        cells: [
          'Sumas iguales',
          null,
          sum(accounts.map((a) => a.debit)),
          sum(accounts.map((a) => a.credit)),
          null,
        ],
        kind: 'grand',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Auxiliar de una cuenta
// ---------------------------------------------------------------------------
export interface LedgerLine {
  entry_number: number
  date: string
  description: string
  debit_cents: number
  credit_cents: number
}
export function buildLedger(
  account: { code: string; name: string; nature: 'deudora' | 'acreedora' },
  lines: LedgerLine[],
  openingCents: bigint,
  period: string,
): Report {
  let running = openingCents
  const sign = account.nature === 'deudora' ? 1n : -1n
  const rows: ReportRow[] = [
    { cells: ['Saldo inicial', null, null, null, openingCents], kind: 'total' },
  ]
  for (const line of lines) {
    running += sign * (BigInt(line.debit_cents) - BigInt(line.credit_cents))
    rows.push({
      cells: [
        `${line.date} · #${line.entry_number} · ${line.description}`,
        null,
        line.debit_cents ? BigInt(line.debit_cents) : null,
        line.credit_cents ? BigInt(line.credit_cents) : null,
        running,
      ],
    })
  }
  rows.push({ cells: ['Saldo final', null, null, null, running], kind: 'grand' })
  return {
    title: `Auxiliar · ${account.code} ${account.name}`,
    subtitle: period,
    columns: ['Movimiento', '', 'Cargo', 'Abono', 'Saldo'],
    rows,
  }
}

// ---------------------------------------------------------------------------
// Saldos por integrante, merch y shows
// ---------------------------------------------------------------------------
export interface MemberBalanceRow {
  display_name: string | null
  cash_cents: number | null
  owed_cents: number | null
  contributions_cents: number | null
  distributions_cents: number | null
}
export function buildMemberBalances(rows: MemberBalanceRow[], asOf: string): Report {
  const n = (value: number | null) => BigInt(value ?? 0)
  return {
    title: 'Saldos por integrante',
    subtitle: asOf,
    columns: ['Integrante', 'Trae de la banda', 'Se le debe', 'Ha aportado', 'Repartos recibidos'],
    rows: [
      ...rows.map((r) => ({
        cells: [
          r.display_name ?? '',
          n(r.cash_cents),
          n(r.owed_cents),
          n(r.contributions_cents),
          n(r.distributions_cents),
        ] as Cell[],
      })),
      {
        cells: [
          'Total',
          sum(rows.map((r) => n(r.cash_cents))),
          sum(rows.map((r) => n(r.owed_cents))),
          sum(rows.map((r) => n(r.contributions_cents))),
          sum(rows.map((r) => n(r.distributions_cents))),
        ],
        kind: 'grand',
      },
    ],
  }
}

/**
 * Liquidación: quién le entrega a quién para dejar todos los saldos en cero,
 * con el menor número de movimientos. Cada integrante debe entregar el efectivo
 * de la banda que trae, y la banda le debe lo que puso de su bolsa; "La banda"
 * es la caja o cuenta común.
 */
export function buildSettlement(rows: MemberBalanceRow[], asOf: string): Report {
  const BAND = 'La banda (caja o cuenta)'
  const debtors: { name: string; cents: bigint }[] = []
  const creditors: { name: string; cents: bigint }[] = []
  let band = 0n
  for (const row of rows) {
    const net = BigInt(row.cash_cents ?? 0) - BigInt(row.owed_cents ?? 0)
    if (net > 0n) debtors.push({ name: row.display_name ?? '', cents: net })
    if (net < 0n) creditors.push({ name: row.display_name ?? '', cents: -net })
    band -= net
  }
  // La banda recibe lo que sobra o pone lo que falta.
  if (band < 0n) creditors.push({ name: BAND, cents: -band })
  if (band > 0n) debtors.push({ name: BAND, cents: band })

  const out: ReportRow[] = []
  const biggest = (list: { name: string; cents: bigint }[]) =>
    list.sort((a, b) =>
      a.cents === b.cents ? a.name.localeCompare(b.name) : b.cents > a.cents ? 1 : -1,
    )
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = biggest(debtors)[0]!
    const creditor = biggest(creditors)[0]!
    const cents = debtor.cents < creditor.cents ? debtor.cents : creditor.cents
    out.push({ cells: [`${debtor.name} le entrega a ${creditor.name}`, cents] })
    debtor.cents -= cents
    creditor.cents -= cents
    if (debtor.cents === 0n) debtors.shift()
    if (creditor.cents === 0n) creditors.shift()
  }
  return {
    title: 'Liquidación: quién le debe a quién',
    subtitle: asOf,
    columns: ['Movimiento para quedar en ceros', 'Monto'],
    rows: out,
  }
}

export interface MerchRow {
  product_name: string
  label: string
  stock_qty: number
  stock_value_cents: number
  avg_cost_cents: number
  sold_qty: number
  gift_qty: number
  revenue_cents: number
  cost_cents: number
  gift_cost_cents: number
}
const pct = (part: bigint, whole: bigint) =>
  whole === 0n ? '—' : `${Number((part * 1000n) / whole) / 10} %`

/** Margen por producto: lo vendido contra su costo. */
export function buildMerchMargin(rows: MerchRow[], period: string): Report {
  const sold = rows.filter((r) => r.sold_qty > 0 || r.gift_qty > 0)
  const revenue = sum(sold.map((r) => BigInt(r.revenue_cents)))
  const cost = sum(sold.map((r) => BigInt(r.cost_cents)))
  return {
    title: 'Margen por producto de merch',
    subtitle: period,
    columns: ['Producto', 'Vendidas', 'Regaladas', 'Ingreso', 'Costo', 'Margen', '% margen'],
    rows: [
      ...sold.map((r) => {
        const margin = BigInt(r.revenue_cents) - BigInt(r.cost_cents)
        return {
          cells: [
            `${r.product_name} · ${r.label}`,
            r.sold_qty,
            r.gift_qty,
            BigInt(r.revenue_cents),
            BigInt(r.cost_cents),
            margin,
            pct(margin, BigInt(r.revenue_cents)),
          ] as Cell[],
        }
      }),
      {
        cells: [
          'Total',
          sold.reduce((t, r) => t + r.sold_qty, 0),
          sold.reduce((t, r) => t + r.gift_qty, 0),
          revenue,
          cost,
          revenue - cost,
          pct(revenue - cost, revenue),
        ],
        kind: 'grand',
      },
    ],
  }
}

/** Inventario valuado y rotación: cuánto hay, cuánto vale y qué tan rápido sale. */
export function buildInventory(rows: MerchRow[], period: string): Report {
  return {
    title: 'Inventario valuado y rotación',
    subtitle: period,
    columns: [
      'Producto',
      'Hay',
      'Costo por pieza',
      'Valor',
      'Salieron en el periodo',
      '% que salió',
    ],
    rows: [
      ...rows.map((r) => {
        const out = r.sold_qty + r.gift_qty
        const base = out + Math.max(r.stock_qty, 0)
        return {
          cells: [
            `${r.product_name} · ${r.label}`,
            r.stock_qty,
            BigInt(r.avg_cost_cents),
            BigInt(r.stock_value_cents),
            out,
            base === 0 ? '—' : `${Math.round((out * 100) / base)} %`,
          ] as Cell[],
        }
      }),
      {
        cells: [
          'Total',
          rows.reduce((t, r) => t + r.stock_qty, 0),
          null,
          sum(rows.map((r) => BigInt(r.stock_value_cents))),
          rows.reduce((t, r) => t + r.sold_qty + r.gift_qty, 0),
          null,
        ],
        kind: 'grand',
      },
    ],
  }
}

export interface ShowReportRow {
  name: string | null
  date: string | null
  city: string | null
  status: string | null
  deal_type: string | null
  show_income_cents: number | null
  merch_revenue_cents: number | null
  merch_cost_cents: number | null
  costs_cents: number | null
  net_cents: number | null
  ticket_price_cents: number | null
  percentage: number | null
  tickets_sold: number | null
  gross_cents: number | null
  commission_cents: number | null
}
const closedShows = (rows: ShowReportRow[], period: Period) =>
  rows.filter(
    (r) =>
      r.status === 'cerrado' &&
      (period.from === null || (r.date ?? '') >= period.from) &&
      (period.to === null || (r.date ?? '') <= period.to),
  )
const showName = (r: ShowReportRow) => `${r.name}${r.city ? ` · ${r.city}` : ''} (${r.date})`

/** Rentabilidad por show: ranking por lo que dejó, incluido el merch. */
export function buildShowRanking(rows: ShowReportRow[], period: Period): Report {
  const n = (value: number | null) => BigInt(value ?? 0)
  const shows = closedShows(rows, period).sort((a, b) => (b.net_cents ?? 0) - (a.net_cents ?? 0))
  return {
    title: 'Rentabilidad por show',
    subtitle: period.label,
    columns: ['Show', 'Nos pagaron', 'Merch (neto)', 'Gastos', 'Dejó'],
    rows: [
      ...shows.map((r) => ({
        cells: [
          showName(r),
          n(r.show_income_cents),
          n(r.merch_revenue_cents) - n(r.merch_cost_cents),
          n(r.costs_cents),
          n(r.net_cents),
        ] as Cell[],
      })),
      {
        cells: [
          'Total',
          sum(shows.map((r) => n(r.show_income_cents))),
          sum(shows.map((r) => n(r.merch_revenue_cents) - n(r.merch_cost_cents))),
          sum(shows.map((r) => n(r.costs_cents))),
          sum(shows.map((r) => n(r.net_cents))),
        ],
        kind: 'grand',
      },
    ],
  }
}

/**
 * Punto de equilibrio por show: gastos directos ÷ lo que deja cada boleto =
 * boletos necesarios para no perder, contra los vendidos. Solo aplica a
 * tratos por boleto (taquilla o boletaje propio).
 */
export function buildBreakEven(rows: ShowReportRow[], period: Period): Report {
  const shows = closedShows(rows, period).filter((r) => (r.tickets_sold ?? 0) > 0)
  return {
    title: 'Punto de equilibrio por show',
    subtitle: period.label,
    columns: [
      'Show',
      'Gastos del show',
      'Deja cada boleto',
      'Boletos para no perder',
      'Boletos vendidos',
    ],
    rows: shows.map((r) => {
      const tickets = BigInt(r.tickets_sold ?? 0)
      // Lo que entró por boletos (taquilla o boletaje, ya sin comisión) entre los boletos vendidos.
      const ticketIncome =
        r.deal_type === 'boletaje_propio'
          ? BigInt(r.gross_cents ?? 0) - BigInt(r.commission_cents ?? 0)
          : BigInt(r.show_income_cents ?? 0)
      const perTicket = tickets > 0n ? ticketIncome / tickets : 0n
      const costs = BigInt(r.costs_cents ?? 0) - BigInt(r.commission_cents ?? 0)
      const needed = perTicket > 0n ? Number((costs + perTicket - 1n) / perTicket) : null
      return { cells: [showName(r), costs, perTicket, needed ?? '—', Number(tickets)] as Cell[] }
    }),
  }
}
