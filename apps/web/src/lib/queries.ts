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
  const id = settings.data?.active_project_id ?? null
  return { id, project: projects.data?.find((p) => p.id === id) ?? null }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [enabled, queryClient])
}
