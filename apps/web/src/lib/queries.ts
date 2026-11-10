// Lecturas (TanStack Query). La caché se persiste en IndexedDB, así que todo
// esto sigue disponible sin señal; Realtime e invalidaciones lo refrescan.
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

async function unwrap<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await query
  if (error) throw error
  return data as T
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => unwrap(supabase.from('profiles').select('*').order('created_at')),
    staleTime: 5 * 60_000,
  })
}

/** Nombre para mostrar de un integrante: "Pepe" (o "Alguien" si aún no carga). */
export function useNameOf(): (id: string | null | undefined) => string {
  const { data } = useProfiles()
  return (id) => data?.find((p) => p.id === id)?.display_name ?? 'Alguien'
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => unwrap(supabase.from('categories').select('*').eq('active', true).order('sort')),
    staleTime: 60 * 60_000,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () =>
      unwrap(
        supabase
          .from('projects')
          .select('*, type:project_types(code, name, emoji, is_show)')
          .neq('status', 'cerrado')
          .order('created_at', { ascending: false }),
      ),
    staleTime: 5 * 60_000,
  })
}

export function useProjectTypes() {
  return useQuery({
    queryKey: ['project_types'],
    queryFn: () => unwrap(supabase.from('project_types').select('*').order('sort')),
    staleTime: 60 * 60_000,
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').single()
      if (error) throw error
      return data
    },
  })
}

/** Proyecto del contexto activo ("Estamos en…"), o null si es operación general. */
export function useActiveProject() {
  const settings = useSettings()
  const projects = useProjects()
  const shows = useShows()
  const id = settings.data?.active_project_id ?? null
  const showId = settings.data?.active_show_id ?? null
  return {
    id,
    project: projects.data?.find((p) => p.id === id) ?? null,
    showId,
    show: shows.data?.find((s) => s.id === showId) ?? null,
  }
}

/** Shows con su gira o proyecto y su boletera, del más reciente al más viejo. */
export function useShows() {
  return useQuery({
    queryKey: ['shows'],
    queryFn: () =>
      unwrap(
        supabase
          .from('shows')
          .select(
            '*, project:projects(id, name, type:project_types(code, emoji)), platform:ticket_platforms(id, name)',
          )
          .order('date', { ascending: false }),
      ),
  })
}
export type ShowRow = NonNullable<ReturnType<typeof useShows>['data']>[number]

export function useShowPnl() {
  return useQuery({
    queryKey: ['show-pnl'],
    queryFn: () => unwrap(supabase.from('v_show_pnl').select('*')),
  })
}

export function usePlatforms() {
  return useQuery({
    queryKey: ['platforms'],
    queryFn: () => unwrap(supabase.from('ticket_platforms').select('*').order('created_at')),
    staleTime: 5 * 60_000,
  })
}

/** Resultado de cada gira o proyecto, con todo lo de sus shows y su merch. */
export function useProjectPnl() {
  return useQuery({
    queryKey: ['project-pnl'],
    queryFn: () => unwrap(supabase.from('v_project_pnl').select('*')),
  })
}

/** Lo que nos deben (venues, boleteras) y anticipos sin aplicar. */
export function useReceivables() {
  return useQuery({
    queryKey: ['receivables'],
    queryFn: () => unwrap(supabase.from('v_receivables').select('*').order('code')),
  })
}

export function useBalances() {
  return useQuery({
    queryKey: ['balances'],
    queryFn: () => unwrap(supabase.from('v_member_balances').select('*')),
  })
}

export function useCashPosition() {
  return useQuery({
    queryKey: ['cash'],
    queryFn: () => unwrap(supabase.from('v_cash_position').select('*')),
  })
}

export function useFeed(limit = 30) {
  return useQuery({
    queryKey: ['feed', limit],
    queryFn: () =>
      unwrap(
        supabase
          .from('v_event_feed')
          .select('*')
          .order('captured_at', { ascending: false })
          .limit(limit),
      ),
  })
}

/** Resultado del mes en curso (hora de México). */
export function useMonthResult() {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'numeric',
  })
    .format(new Date())
    .split('-')
    .map(Number) as [number, number]

  return useQuery({
    queryKey: ['results', 'month', year, month],
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('v_results_by_period')
          .select('*')
          .eq('year', year)
          .eq('month', month)
          .maybeSingle(),
      )) ?? { year, month, income_cents: 0, expense_cents: 0 },
  })
}

export function useProjectResult(projectId: string | null) {
  return useQuery({
    queryKey: ['results', 'project', projectId],
    enabled: projectId !== null,
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('v_results_by_project')
          .select('*')
          .eq('project_id', projectId!)
          .maybeSingle(),
      )) ?? { project_id: projectId, income_cents: 0, expense_cents: 0 },
  })
}

/** Catálogo de merch con existencias (sirve offline desde la caché). */
export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () =>
      unwrap(
        supabase
          .from('v_inventory')
          .select('*')
          .order('product_sort')
          .order('product_name')
          .order('variant_sort'),
      ),
  })
}

/** Ventas de merch de hoy (hora de México), todas las giras juntas. */
export function useMerchToday() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(),
  )
  return useQuery({
    queryKey: ['merch-today', day],
    queryFn: async () => {
      const rows = await unwrap(supabase.from('v_merch_daily').select('*').eq('day', day))
      return rows.reduce(
        (sum, row) => ({
          pieces: sum.pieces + (row.pieces ?? 0),
          revenue: sum.revenue + (row.revenue_cents ?? 0),
          cost: sum.cost + (row.cost_cents ?? 0),
        }),
        { pieces: 0, revenue: 0, cost: 0 },
      )
    },
  })
}

/** Movimientos de inventario de una variante, del más viejo al más nuevo. */
export function useKardex(variantId: string | null) {
  return useQuery({
    queryKey: ['kardex', variantId],
    enabled: variantId !== null,
    queryFn: () =>
      unwrap(
        supabase.from('v_kardex').select('*').eq('variant_id', variantId!).order('movement_id'),
      ),
  })
}

export function useJournal(limit = 100) {
  return useQuery({
    queryKey: ['journal', limit],
    queryFn: () =>
      unwrap(
        supabase
          .from('journal_entries')
          .select(
            'id, number, date, description, reverses_entry_id, source_event_id, lines:journal_lines(id, debit_cents, credit_cents, account:accounts(code, name))',
          )
          .order('number', { ascending: false })
          .limit(limit),
      ),
  })
}

export function useTrialBalance() {
  return useQuery({
    queryKey: ['trial-balance'],
    queryFn: () => unwrap(supabase.from('v_trial_balance').select('*').order('code')),
  })
}

// ---------------------------------------------------------------------------
// Reportes (Fase 5)
// ---------------------------------------------------------------------------
const orUndefined = (value: string | null) => value ?? undefined

/** Cargos y abonos por cuenta en un rango (null = sin límite). */
export function useAccountTotals(from: string | null, to: string | null, enabled = true) {
  return useQuery({
    queryKey: ['report', 'totals', from, to],
    enabled,
    queryFn: () =>
      unwrap(
        supabase.rpc('report_account_totals', { p_from: orUndefined(from), p_to: orUndefined(to) }),
      ),
  })
}

export function useCashFlow(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['report', 'cash-flow', from, to],
    queryFn: () =>
      unwrap(
        supabase.rpc('report_cash_flow', { p_from: orUndefined(from), p_to: orUndefined(to) }),
      ),
  })
}

export function useMerchReport(from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['report', 'merch', from, to],
    queryFn: () =>
      unwrap(supabase.rpc('report_merch', { p_from: orUndefined(from), p_to: orUndefined(to) })),
  })
}

export function useLedger(accountId: string | null, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['report', 'ledger', accountId, from, to],
    enabled: accountId !== null,
    queryFn: () =>
      unwrap(
        supabase.rpc('report_ledger', {
          p_account: accountId!,
          p_from: orUndefined(from),
          p_to: orUndefined(to),
        }),
      ),
  })
}

export function useShowReport() {
  return useQuery({
    queryKey: ['report', 'shows'],
    queryFn: () => unwrap(supabase.from('v_show_report').select('*')),
  })
}

export function useAlerts() {
  return useQuery({
    queryKey: ['report', 'alerts'],
    queryFn: () => unwrap(supabase.from('v_alerts').select('*')),
  })
}

/** Realtime: cuando alguien registra algo o cambia el contexto, se refresca todo. */
export function useRealtimeRefresh(enabled: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void queryClient.invalidateQueries(), 200)
    }
    const channel = supabase
      .channel('moodra-en-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])
}
