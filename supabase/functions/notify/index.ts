// notify: manda las notificaciones push (Web Push con VAPID).
//
//   GET                      → { configured, publicKey } para que la app se suscriba.
//   POST (sesión de usuario) → revisa lo reciente (entregas por confirmar,
//                              respuestas a entregas, stock bajo) y avisa.
//   POST { daily: true } con el encabezado x-cron-secret → avisos del día
//                              (shows sin cerrar, resumen de gira, efectivo alto,
//                              entregas viejas). Lo llama GitHub Actions cada noche.
//
// Cada aviso se manda una sola vez (notification_log) y respeta lo que cada
// quien silenció. Las llaves viven en los secrets de Supabase: VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT y CRON_SECRET.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type Kind =
  | 'entrega_recibida'
  | 'entrega_respuesta'
  | 'show_sin_cerrar'
  | 'resumen'
  | 'efectivo_alto'
  | 'stock'
  | 'entregas_pendientes'

interface Notice {
  /** Llave única: el mismo aviso no se manda dos veces. */
  key: string
  kind: Kind
  to: string[]
  title: string
  body: string
  url: string
}

const pesos = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(cents / 100)
    .replace(/\.00$/, '')

async function send(admin: SupabaseClient, notices: Notice[]) {
  let sent = 0
  for (const notice of notices) {
    const recipients = [...new Set(notice.to)].filter(Boolean)
    if (recipients.length === 0) continue
    // Si la llave ya existe, este aviso ya salió.
    const { error: duplicate } = await admin.from('notification_log').insert({ key: notice.key })
    if (duplicate) continue

    const { data: prefs } = await admin
      .from('notification_prefs')
      .select('user_id, muted')
      .in('user_id', recipients)
    const muted = new Set(
      (prefs ?? [])
        .filter((p) => (p.muted as string[]).includes(notice.kind))
        .map((p) => p.user_id),
    )
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in(
        'user_id',
        recipients.filter((id) => !muted.has(id)),
      )
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: notice.title,
            body: notice.body,
            url: notice.url,
            tag: notice.key,
          }),
        )
        sent++
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        // 404/410: el dispositivo ya no existe; se borra su suscripción.
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push', status, String(error).slice(0, 200))
        }
      }
    }
  }
  return sent
}

async function activeMembers(admin: SupabaseClient) {
  const { data } = await admin.from('profiles').select('id, display_name, role').eq('activo', true)
  return data ?? []
}

/** Avisos por lo que acaba de pasar (los pide la app después de sincronizar). */
async function recentNotices(admin: SupabaseClient): Promise<Notice[]> {
  const members = await activeMembers(admin)
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? 'Alguien'
  const contadores = members.filter((m) => m.role === 'contador').map((m) => m.id)
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const notices: Notice[] = []

  const { data: transfers } = await admin
    .from('cash_transfers')
    .select(
      'event_id, to_kind, to_member, amount_cents, confirmed_by, event:events!inner(status, created_by, created_at)',
    )
    .gte('event.created_at', since)
  for (const t of transfers ?? []) {
    const event = t.event as unknown as { status: string; created_by: string }
    if (event.status === 'pendiente_confirmacion') {
      notices.push({
        key: `recibida:${t.event_id}`,
        kind: 'entrega_recibida',
        to: t.to_kind === 'integrante' ? [t.to_member as string] : contadores,
        title: 'Te pasaron efectivo',
        body: `${nameOf(event.created_by)} dice que entregó ${pesos(t.amount_cents)}. Confirma que lo recibiste.`,
        url: '/',
      })
    } else if (
      event.status === 'registrado' &&
      t.confirmed_by &&
      t.confirmed_by !== event.created_by
    ) {
      notices.push({
        key: `confirmada:${t.event_id}`,
        kind: 'entrega_respuesta',
        to: [event.created_by],
        title: 'Tu entrega fue confirmada',
        body: `${nameOf(t.confirmed_by)} confirmó que recibió ${pesos(t.amount_cents)}.`,
        url: '/movimientos',
      })
    } else if (event.status === 'rechazado') {
      notices.push({
        key: `rechazada:${t.event_id}`,
        kind: 'entrega_respuesta',
        to: [event.created_by, ...contadores],
        title: 'Una entrega fue rechazada',
        body: `No se confirmó la entrega de ${pesos(t.amount_cents)} de ${nameOf(event.created_by)}.`,
        url: '/movimientos',
      })
    }
  }

  // Stock bajo o negativo: una vez al día por producto.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(),
  )
  const { data: alerts } = await admin
    .from('v_alerts')
    .select('kind, ref, title, amount')
    .in('kind', ['stock_bajo', 'stock_negativo'])
  for (const alert of alerts ?? []) {
    notices.push({
      key: `stock:${alert.ref}:${today}`,
      kind: 'stock',
      to: contadores,
      title:
        alert.kind === 'stock_negativo' ? 'Existencias en negativo' : 'Se está acabando la merch',
      body: `${alert.title}: ${alert.kind === 'stock_negativo' ? 'se vendió más de lo que había' : `quedan ${alert.amount}`}.`,
      url: '/merch',
    })
  }
  return notices
}

/** Avisos del día (cron nocturno). */
async function dailyNotices(admin: SupabaseClient): Promise<Notice[]> {
  const members = await activeMembers(admin)
  const everyone = members.map((m) => m.id)
  const contadores = members.filter((m) => m.role === 'contador').map((m) => m.id)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(),
  )
  const notices: Notice[] = []

  const { data: alerts } = await admin.from('v_alerts').select('kind, ref, title, amount')
  for (const alert of alerts ?? []) {
    if (alert.kind === 'show_sin_cerrar') {
      notices.push({
        key: `show:${alert.ref}:${today}`,
        kind: 'show_sin_cerrar',
        to: everyone,
        title: 'Falta cerrar un show',
        body: `${alert.title}: cuéntanos cuánto les pagaron y dónde quedó. Son 10 segundos.`,
        url: '/shows',
      })
    }
  }
  const old = (alerts ?? []).filter((a) => a.kind === 'entrega_sin_confirmar')
  if (old.length > 0) {
    notices.push({
      key: `entregas:${today}`,
      kind: 'entregas_pendientes',
      to: contadores,
      title: 'Entregas sin confirmar',
      body: `Hay ${old.length} ${old.length === 1 ? 'entrega' : 'entregas'} de efectivo con más de 2 días sin confirmar.`,
      url: '/movimientos',
    })
  }

  // Efectivo de la banda que alguien trae desde hace días.
  const { data: settings } = await admin
    .from('app_settings')
    .select('active_project_id, cash_alert_threshold_cents, cash_alert_days')
    .single()
  if (settings) {
    const { data: balances } = await admin.from('v_member_balances').select('member_id, cash_cents')
    const cutoff = new Date(Date.now() - settings.cash_alert_days * 86_400_000).toISOString()
    for (const row of balances ?? []) {
      if ((row.cash_cents ?? 0) <= settings.cash_alert_threshold_cents) continue
      // Si entregó algo en estos días, no se le molesta.
      const { count } = await admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'entrega_efectivo')
        .eq('created_by', row.member_id)
        .gte('created_at', cutoff)
      if ((count ?? 0) > 0) continue
      notices.push({
        key: `efectivo:${row.member_id}:${today}`,
        kind: 'efectivo_alto',
        to: [row.member_id as string],
        title: 'Traes dinero de la banda',
        body: `Traes ${pesos(row.cash_cents ?? 0)} de la banda desde hace días. Entrégalo o deposítalo cuando puedas.`,
        url: '/',
      })
    }

    // Resumen de la gira o proyecto activo.
    if (settings.active_project_id) {
      const { data: totals } = await admin.rpc('report_account_totals', {
        p_from: today,
        p_to: today,
        p_project: settings.active_project_id,
      })
      const { data: merch } = await admin.from('v_merch_daily').select('pieces').eq('day', today)
      let result = 0
      for (const row of totals ?? []) {
        if (row.type === 'ingreso') result += row.credit_cents - row.debit_cents
        else if (['costo', 'gasto', 'otro'].includes(row.type))
          result -= row.debit_cents - row.credit_cents
      }
      const pieces = (merch ?? []).reduce((sum, row) => sum + (row.pieces ?? 0), 0)
      if (result !== 0 || pieces > 0) {
        notices.push({
          key: `resumen:${today}`,
          kind: 'resumen',
          to: everyone,
          title: 'Así nos fue hoy',
          body: `Hoy: ${result >= 0 ? '+' : '−'}${pesos(Math.abs(result))}${pieces > 0 ? `, ${pieces} ${pieces === 1 ? 'pieza vendida' : 'piezas vendidas'}` : ''}.`,
          url: '/reportes',
        })
      }
    }
  }
  return notices
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const configured = Boolean(publicKey && privateKey)
  if (req.method !== 'GET' && req.method !== 'POST')
    return json(405, { error: 'Método no permitido' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(500, { error: 'Función mal configurada' })
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // GET: la llave pública para suscribirse. De paso toca la base, así el
  // trabajo nocturno la mantiene despierta aunque no haya secretos puestos.
  if (req.method === 'GET') {
    const { error } = await admin.from('app_settings').select('id').single()
    return json(200, { configured, publicKey: publicKey ?? null, db: !error })
  }

  let body: { daily?: boolean } = {}
  try {
    body = (await req.json()) as { daily?: boolean }
  } catch {
    body = {}
  }

  if (body.daily) {
    const secret = Deno.env.get('CRON_SECRET')
    if (!secret || req.headers.get('x-cron-secret') !== secret)
      return json(401, { error: 'No autorizado' })
  } else {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json(401, { error: 'Falta sesión' })
    const { data: caller, error } = await admin.auth.getUser(token)
    if (error || !caller.user) return json(401, { error: 'Sesión inválida' })
  }

  // Sin llaves no se manda nada, pero el cron sigue sirviendo para mantener viva la base.
  await admin.from('app_settings').select('id').single()
  if (!configured) return json(200, { configured: false, sent: 0 })
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hola@moodra.mx',
    publicKey!,
    privateKey!,
  )

  const notices = body.daily ? await dailyNotices(admin) : await recentNotices(admin)
  const sent = await send(admin, notices)
  return json(200, { configured: true, notices: notices.length, sent })
})
