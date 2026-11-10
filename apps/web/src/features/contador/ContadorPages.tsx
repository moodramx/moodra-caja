// Vista contador mínima de la Fase 1. Aquí SÍ se habla en contabilidad.
import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { Card, EmptyState, Page } from '../../design/Page'
import { useAuth } from '../../lib/auth'
import { formatMXN } from '../../lib/money'
import { useJournal, useTrialBalance } from '../../lib/queries'

const cents = (value: number | null) => (value ? formatMXN(BigInt(value)) : '')

/** Solo el contador entra; la seguridad real está en la base (RLS y RPC). */
export function ContadorOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile && profile.role !== 'contador') return <Navigate to="/" />
  return children
}

export function DiarioPage() {
  const journal = useJournal()

  return (
    <ContadorOnly>
      <Page number="C2" title="Libro diario">
        {journal.isPending && <p className="text-ink-muted">Afinando…</p>}
        {journal.data?.length === 0 && (
          <EmptyState emoji="📒" title="Sin asientos" hint="Se generan solos con cada captura." />
        )}
        {journal.data?.map((entry) => (
          <Card key={entry.id}>
            <p className="label-mono text-ink-muted">
              #{entry.number} · {entry.date}
              {entry.reverses_entry_id && ' · reversa'}
            </p>
            <p className="mt-1 font-semibold">{entry.description}</p>
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-1 font-medium">Cuenta</th>
                  <th className="pb-1 text-right font-medium">Debe</th>
                  <th className="pb-1 text-right font-medium">Haber</th>
                </tr>
              </thead>
              <tbody>
                {[...entry.lines]
                  .sort((a, b) => b.debit_cents - a.debit_cents)
                  .map((line) => (
                    <tr key={line.id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-xs text-ink-muted">
                          {line.account?.code}
                        </span>{' '}
                        {line.account?.name}
                      </td>
                      <td className="py-1.5 text-right">{cents(line.debit_cents)}</td>
                      <td className="py-1.5 text-right">{cents(line.credit_cents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        ))}
      </Page>
    </ContadorOnly>
  )
}

export function BalanzaPage() {
  const balance = useTrialBalance()
  const rows = (balance.data ?? []).filter((row) => row.debit_cents || row.credit_cents)
  const debit = rows.reduce((sum, row) => sum + BigInt(row.debit_cents ?? 0), 0n)
  const credit = rows.reduce((sum, row) => sum + BigInt(row.credit_cents ?? 0), 0n)

  return (
    <ContadorOnly>
      <Page number="C3" title="Balanza">
        {balance.isPending && <p className="text-ink-muted">Afinando…</p>}
        {balance.data && rows.length === 0 && (
          <EmptyState
            emoji="⚖️"
            title="Sin movimientos"
            hint="La balanza aparece con el primer registro."
          />
        )}
        {rows.length > 0 && (
          <Card>
            <p
              className={`font-semibold ${debit === credit ? 'text-in' : 'text-danger'}`}
              role="status"
            >
              {debit === credit ? 'La balanza cuadra ✓' : 'La balanza NO cuadra'}
            </p>
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-1 font-medium">Cuenta</th>
                  <th className="pb-1 text-right font-medium">Debe</th>
                  <th className="pb-1 text-right font-medium">Haber</th>
                  <th className="pb-1 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.account_id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      <span className="font-mono text-xs text-ink-muted">{row.code}</span>{' '}
                      {row.name}
                    </td>
                    <td className="py-1.5 text-right">{cents(row.debit_cents)}</td>
                    <td className="py-1.5 text-right">{cents(row.credit_cents)}</td>
                    <td className="py-1.5 text-right font-semibold">
                      {formatMXN(BigInt(row.balance_cents ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink font-semibold">
                  <td className="py-2">Sumas iguales</td>
                  <td className="py-2 text-right">{formatMXN(debit)}</td>
                  <td className="py-2 text-right">{formatMXN(credit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </Card>
        )}
      </Page>
    </ContadorOnly>
  )
}
