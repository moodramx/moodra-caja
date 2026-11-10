// Vista contador mínima de la Fase 1. Aquí SÍ se habla en contabilidad.
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { formatMXN } from '../../lib/money'
import { useJournal, useProjects, useProjectTypes, useTrialBalance } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass } from '../captura/parts'

const cents = (value: number | null) => (value ? formatMXN(BigInt(value)) : '')

/** Solo el contador entra; la seguridad real está en la base (RLS y RPC). */
function ContadorOnly({ children }: { children: ReactNode }) {
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

export function ProyectosPage() {
  const projects = useProjects()
  const types = useProjectTypes()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [typeCode, setTypeCode] = useState('GIR')

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_project', {
        p_type_code: typeCode,
        p_name: name.trim(),
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ message: `Listo: "${name.trim()}" ya se puede elegir en Inicio.` })
      setName('')
      setOpen(false)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) create.mutate()
  }

  return (
    <ContadorOnly>
      <Page number="C4" title="Giras y proyectos">
        {projects.data?.length === 0 && (
          <EmptyState
            emoji="🚐"
            title="Sin proyectos"
            hint="Crea una gira o un show para etiquetar lo que se registre."
          />
        )}
        {projects.data && projects.data.length > 0 && (
          <Card className="divide-y divide-line">
            {projects.data.map((project) => (
              <div key={project.id} className="flex min-h-14 items-center gap-3 py-2">
                <span aria-hidden="true" className="text-2xl">
                  {project.type?.emoji}
                </span>
                <span>
                  <span className="block font-semibold">{project.name}</span>
                  <span className="label-mono block text-ink-muted">{project.code}</span>
                </span>
              </div>
            ))}
          </Card>
        )}
        <Button size="lg" block onClick={() => setOpen(true)}>
          Nuevo proyecto
        </Button>

        <BottomSheet open={open} onOpenChange={setOpen} title="Nuevo proyecto">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <label className="block space-y-2">
              <span className="text-sm text-ink-muted">Nombre</span>
              <input
                className={fieldClass}
                value={name}
                maxLength={80}
                placeholder="Ej. Gira Bajío 2026"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {types.data
                ?.filter((type) => type.code !== 'OPE')
                .map((type) => (
                  <Chip
                    key={type.code}
                    emoji={type.emoji}
                    selected={typeCode === type.code}
                    onClick={() => setTypeCode(type.code)}
                  >
                    {type.name}
                  </Chip>
                ))}
            </div>
            {create.error && (
              <p role="alert" className="text-danger">
                {create.error.message}
              </p>
            )}
            <Button type="submit" size="lg" block disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear proyecto'}
            </Button>
          </form>
        </BottomSheet>
      </Page>
    </ContadorOnly>
  )
}
