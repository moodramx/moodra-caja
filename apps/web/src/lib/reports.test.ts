import { describe, expect, it } from 'vitest'
import {
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
  type Report,
  type ShowReportRow,
} from './reports'

const acc = (
  code: string,
  name: string,
  type: AccountTotal['type'],
  debit: number,
  credit: number,
): AccountTotal => ({
  code,
  name,
  type,
  nature: ['activo', 'costo', 'gasto', 'otro'].includes(type) ? 'deudora' : 'acreedora',
  debit_cents: debit,
  credit_cents: credit,
})

// Mismo escenario que supabase/tests/040_reportes.test.sql (en centavos).
const totals: AccountTotal[] = [
  acc('1.2.01', 'Cuenta Moodra', 'activo', 1_500_000, 100_000),
  acc('1.1.12', 'Efectivo en poder de Pepe', 'activo', 70_000, 30_000),
  acc('1.1.01', 'Caja Moodra', 'activo', 30_000, 0),
  acc('1.4.01', 'Playeras', 'activo', 100_000, 20_000),
  acc('2.1.02', 'Por regresar a Pepe', 'pasivo', 0, 50_000),
  acc('2.2', 'Proveedores y terceros por pagar', 'pasivo', 0, 70_000),
  acc('3.1.02', 'Aportaciones de Pepe', 'patrimonio', 0, 500_000),
  acc('3.3', 'Resultados acumulados', 'patrimonio', 0, 100_000),
  acc('4.1.01', 'Fee fijo', 'ingreso', 0, 800_000),
  acc('4.2.01', 'Playeras', 'ingreso', 0, 70_000),
  acc('4.3.01', 'Streaming (DistroKid)', 'ingreso', 0, 200_000),
  acc('5.1', 'Costo de venta de merch', 'costo', 20_000, 0),
  acc('6.02', 'Producción musical', 'gasto', 70_000, 0),
  acc('6.05', 'Promoción y publicidad', 'gasto', 100_000, 0),
  acc('6.99', 'Otros gastos', 'gasto', 50_000, 0),
]
const flows = [
  { kind: 'puse_dinero', detail: '', inflow_cents: 500_000, outflow_cents: 0, net_cents: 500_000 },
  { kind: 'gasto', detail: 'Promo', inflow_cents: 0, outflow_cents: 100_000, net_cents: -100_000 },
  {
    kind: 'ingreso',
    detail: 'Streaming (DistroKid)',
    inflow_cents: 200_000,
    outflow_cents: 0,
    net_cents: 200_000,
  },
  {
    kind: 'ingreso',
    detail: 'Show en vivo',
    inflow_cents: 800_000,
    outflow_cents: 0,
    net_cents: 800_000,
  },
  { kind: 'venta_merch', detail: '', inflow_cents: 70_000, outflow_cents: 0, net_cents: 70_000 },
]

const amount = (report: Report, label: string, column = 1) =>
  report.rows.find((row) => row.cells[0] === label)?.cells[column]

describe('periodos', () => {
  it('mes actual, con el anterior para comparar', () => {
    expect(periodOf('mes', '2026-11-10')).toEqual({
      kind: 'mes',
      label: 'noviembre 2026',
      from: '2026-11-01',
      to: '2026-11-30',
      previous: { label: 'octubre 2026', from: '2026-10-01', to: '2026-10-31' },
    })
  })

  it('cruza de año y respeta febrero bisiesto', () => {
    expect(periodOf('mes_pasado', '2027-01-15')).toMatchObject({
      label: 'diciembre 2026',
      from: '2026-12-01',
      to: '2026-12-31',
    })
    expect(periodOf('mes', '2028-02-10').to).toBe('2028-02-29')
    expect(periodOf('anio', '2026-11-10')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodOf('todo', '2026-11-10')).toMatchObject({ from: null, to: null })
    expect(dayBefore('2026-11-01')).toBe('2026-10-31')
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
  })
})

describe('estado de resultados', () => {
  it('agrupa, subtotala y llega al resultado', () => {
    const report = buildIncomeStatement(totals, 'noviembre 2026')
    expect(amount(report, 'Total ingresos')).toBe(1_070_000n)
    expect(amount(report, 'Total costos directos')).toBe(20_000n)
    expect(amount(report, 'Utilidad bruta')).toBe(1_050_000n)
    expect(amount(report, 'Total gastos de operación')).toBe(220_000n)
    expect(amount(report, 'Resultado')).toBe(830_000n)
    expect(resultOf(totals)).toBe(830_000n)
    expect(report.rows.at(-1)?.kind).toBe('grand')
  })

  it('comparativo mes contra mes, incluidas cuentas que solo movió el mes anterior', () => {
    const before = [
      acc('6.05', 'Promoción y publicidad', 'gasto', 30_000, 0),
      acc('6.07', 'Software', 'gasto', 9_900, 0),
    ]
    const report = buildIncomeStatement(totals, 'noviembre 2026', {
      rows: before,
      label: 'octubre 2026',
    })
    expect(report.columns).toEqual(['Concepto', 'noviembre 2026', 'octubre 2026'])
    expect(report.rows.find((r) => r.cells[0] === '6.05 Promoción y publicidad')?.cells).toEqual([
      '6.05 Promoción y publicidad',
      100_000n,
      30_000n,
    ])
    expect(report.rows.find((r) => r.cells[0] === '6.07 Software')?.cells).toEqual([
      '6.07 Software',
      0n,
      9_900n,
    ])
    expect(amount(report, 'Resultado', 2)).toBe(-39_900n)
  })
})

describe('balance general', () => {
  it('activo = pasivo + fondo + resultado', () => {
    const { report, assets, liabilitiesAndEquity } = buildBalanceSheet(totals, 'al 30 de noviembre')
    expect(assets).toBe(1_550_000n)
    expect(liabilitiesAndEquity).toBe(assets)
    expect(amount(report, 'Total pasivo')).toBe(120_000n)
    expect(amount(report, 'Resultado acumulado (sin cerrar)')).toBe(830_000n)
    expect(amount(report, 'Total fondo')).toBe(1_430_000n)
  })

  it('el resultado es igual a la variación del patrimonio (criterio de la Fase 5)', () => {
    const { assets } = buildBalanceSheet(totals, '')
    const liabilities = 120_000n
    const contributed = 600_000n
    expect(resultOf(totals)).toBe(assets - liabilities - contributed)
  })
})

describe('flujo de efectivo', () => {
  it('entradas, salidas y saldo final', () => {
    const { report, change, closing } = buildCashFlow(flows, 0n, 'todo')
    expect(amount(report, 'Total entradas')).toBe(1_570_000n)
    expect(amount(report, 'Total salidas')).toBe(100_000n)
    expect(amount(report, 'Gastos: Promo')).toBe(100_000n)
    expect(amount(report, 'Cobros: Show en vivo')).toBe(800_000n)
    expect(change).toBe(1_470_000n)
    expect(closing).toBe(1_470_000n)
  })

  it('el flujo es igual a la variación de caja, bancos y efectivo (criterio de la Fase 5)', () => {
    expect(buildCashFlow(flows, 0n, '').change).toBe(cashOf(totals))
    expect(buildCashFlow(flows, 250_000n, '').closing).toBe(250_000n + cashOf(totals))
  })
})

describe('balanza y auxiliar', () => {
  it('sumas iguales y saldo final = inicial + movimientos', () => {
    const opening = [
      acc('1.2.01', 'Cuenta Moodra', 'activo', 400_000, 0),
      acc('3.1.02', 'Aportaciones de Pepe', 'patrimonio', 0, 400_000),
    ]
    const report = buildTrialBalance(opening, totals, 'noviembre 2026')
    const cuenta = report.rows.find((r) => r.cells[0] === '1.2.01 Cuenta Moodra')
    expect(cuenta?.cells).toEqual([
      '1.2.01 Cuenta Moodra',
      400_000n,
      1_500_000n,
      100_000n,
      1_800_000n,
    ])
    const sums = report.rows.at(-1)!.cells
    expect(sums[2]).toBe(sums[3])
    expect(sums[2]).toBe(1_940_000n)
  })

  it('auxiliar con saldo corrido, también para cuentas acreedoras', () => {
    const lines = [
      {
        entry_number: 4,
        date: '2026-11-02',
        description: 'Gasto: Transporte',
        debit_cents: 0,
        credit_cents: 50_000,
      },
      {
        entry_number: 9,
        date: '2026-11-08',
        description: 'Regreso de dinero',
        debit_cents: 20_000,
        credit_cents: 0,
      },
    ]
    const report = buildLedger(
      { code: '2.1.02', name: 'Por regresar a Pepe', nature: 'acreedora' },
      lines,
      10_000n,
      'nov',
    )
    expect(report.rows.map((r) => r.cells[4])).toEqual([10_000n, 60_000n, 40_000n, 40_000n])
  })
})

describe('integrantes, merch y shows', () => {
  it('saldos por integrante con totales', () => {
    const report = buildMemberBalances(
      [
        {
          display_name: 'Pepe',
          cash_cents: 40_000,
          owed_cents: 50_000,
          contributions_cents: 500_000,
          distributions_cents: 0,
        },
        {
          display_name: 'Diego',
          cash_cents: 0,
          owed_cents: 0,
          contributions_cents: 0,
          distributions_cents: 0,
        },
      ],
      'hoy',
    )
    expect(report.rows.at(-1)?.cells).toEqual(['Total', 40_000n, 50_000n, 500_000n, 0n])
  })

  const merch = [
    {
      product_name: 'Playera',
      label: 'M',
      stock_qty: 8,
      stock_value_cents: 80_000,
      avg_cost_cents: 10_000,
      sold_qty: 2,
      gift_qty: 1,
      revenue_cents: 70_000,
      cost_cents: 20_000,
      gift_cost_cents: 10_000,
    },
    {
      product_name: 'Sticker',
      label: 'Único',
      stock_qty: 50,
      stock_value_cents: 40_000,
      avg_cost_cents: 800,
      sold_qty: 0,
      gift_qty: 0,
      revenue_cents: 0,
      cost_cents: 0,
      gift_cost_cents: 0,
    },
  ]
  it('margen por producto: solo lo que se movió', () => {
    const report = buildMerchMargin(merch, 'nov')
    expect(report.rows).toHaveLength(2)
    expect(report.rows[0]?.cells).toEqual([
      'Playera · M',
      2,
      1,
      70_000n,
      20_000n,
      50_000n,
      '71.4 %',
    ])
  })
  it('inventario valuado y qué tanto salió', () => {
    const report = buildInventory(merch, 'nov')
    expect(report.rows[0]?.cells).toEqual(['Playera · M', 8, 10_000n, 80_000n, 3, '27 %'])
    expect(report.rows.at(-1)?.cells[3]).toBe(120_000n)
  })

  const show = (over: Partial<ShowReportRow>): ShowReportRow => ({
    name: 'Show',
    date: '2026-11-08',
    city: null,
    status: 'cerrado',
    deal_type: 'fee_fijo',
    show_income_cents: 0,
    merch_revenue_cents: 0,
    merch_cost_cents: 0,
    costs_cents: 0,
    net_cents: 0,
    ticket_price_cents: 0,
    percentage: 0,
    tickets_sold: null,
    gross_cents: 0,
    commission_cents: 0,
    ...over,
  })
  const period = periodOf('mes', '2026-11-10')
  const shows = [
    show({ name: 'Fijo', show_income_cents: 800_000, costs_cents: 270_000, net_cents: 530_000 }),
    show({
      name: 'Taquilla',
      deal_type: 'porcentaje_taquilla',
      show_income_cents: 1_050_000,
      costs_cents: 280_000,
      net_cents: 770_000,
      tickets_sold: 75,
    }),
    show({
      name: 'Boletos',
      deal_type: 'boletaje_propio',
      show_income_cents: 1_500_000,
      gross_cents: 1_500_000,
      commission_cents: 180_000,
      costs_cents: 230_000,
      net_cents: 1_270_000,
      tickets_sold: 60,
    }),
    show({ name: 'Abierto', status: 'programado', net_cents: 999 }),
    show({ name: 'Octubre', date: '2026-10-20', net_cents: 5 }),
  ]

  it('ranking por lo que dejó, solo shows cerrados del periodo', () => {
    const report = buildShowRanking(shows, period)
    expect(report.rows.map((r) => r.cells[0])).toEqual([
      'Boletos (2026-11-08)',
      'Taquilla (2026-11-08)',
      'Fijo (2026-11-08)',
      'Total',
    ])
    expect(report.rows.at(-1)?.cells[4]).toBe(2_570_000n)
  })

  it('punto de equilibrio: boletos para no perder contra los vendidos', () => {
    const report = buildBreakEven(shows, period)
    // Taquilla: $10,500 entre 75 boletos = $140 por boleto; $2,800 de gastos → 20 boletos.
    expect(report.rows[0]?.cells).toEqual(['Taquilla (2026-11-08)', 280_000n, 14_000n, 20, 75])
    // Boletaje: ($15,000 − $1,800) entre 60 = $220; gastos sin la comisión $500 → 3 boletos.
    expect(report.rows[1]?.cells).toEqual(['Boletos (2026-11-08)', 50_000n, 22_000n, 3, 60])
    expect(report.rows).toHaveLength(2)
  })
})
