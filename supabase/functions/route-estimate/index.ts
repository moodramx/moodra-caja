// route-estimate: distancia, tiempo con tráfico y casetas entre dos direcciones,
// con la Routes API de Google. La llave (GOOGLE_MAPS_KEY) vive solo en los
// secrets de Supabase. Sin llave responde { configured: false } y la app deja
// capturar los kilómetros y las casetas a mano.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const Body = z.object({
  origin: z.string().trim().min(3).max(300),
  destination: z.string().trim().min(3).max(300),
})

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** "1234s" → 1234 */
const seconds = (value: unknown) => {
  const n = Number.parseInt(String(value ?? '').replace(/s$/, ''), 10)
  return Number.isFinite(n) ? n : null
}

/** Motivo que da Google al rechazar una consulta (nunca incluye la llave). */
async function googleError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as {
      error?: { message?: string; status?: string; details?: { reason?: string }[] }
    }
    const reason = body.error?.details?.find((d) => d.reason)?.reason
    return [body.error?.status, reason, body.error?.message]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 400)
  } catch {
    return text.slice(0, 300)
  }
}

interface Money {
  currencyCode?: string
  units?: string
  nanos?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(500, { error: 'Función mal configurada' })
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Solo integrantes activos (cada consulta a Google cuenta para la cuota).
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Falta sesión' })
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json(401, { error: 'Sesión inválida' })
  const { data: profile } = await admin
    .from('profiles')
    .select('id, activo')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (!profile?.activo) return json(403, { error: 'Usuario no autorizado' })

  const key = Deno.env.get('GOOGLE_MAPS_KEY')
  if (!key) return json(200, { configured: false })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return json(400, { error: 'Faltan las direcciones' })

  const ask = (withTolls: boolean) =>
    fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.staticDuration' +
          (withTolls ? ',routes.travelAdvisory.tollInfo' : ''),
      },
      body: JSON.stringify({
        origin: { address: parsed.data.origin },
        destination: { address: parsed.data.destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        ...(withTolls
          ? {
              extraComputations: ['TOLLS'],
              routeModifiers: {
                vehicleInfo: { emissionType: 'GASOLINE' },
                tollPasses: ['MX_TAG_IAVE', 'MX_PASE', 'MX_TAG_TELEVIA'],
              },
            }
          : {}),
        regionCode: 'mx',
        languageCode: 'es-419',
        units: 'METRIC',
      }),
    })

  // Primero con casetas; si Google la rechaza, se reintenta sin casetas para
  // al menos traer distancia y tráfico, y se avisa por qué.
  let tollsAsked = true
  let response = await ask(true)
  let firstError = ''
  if (!response.ok) {
    firstError = await googleError(response)
    console.error('Routes API (con casetas)', response.status, firstError)
    tollsAsked = false
    response = await ask(false)
  }
  if (!response.ok) {
    const reason = await googleError(response)
    console.error('Routes API (sin casetas)', response.status, reason)
    return json(502, {
      configured: true,
      error: `Google rechazó la consulta (${response.status}): ${reason}`,
    })
  }
  const data = (await response.json()) as {
    routes?: {
      distanceMeters?: number
      duration?: string
      staticDuration?: string
      travelAdvisory?: { tollInfo?: { estimatedPrice?: Money[] } }
    }[]
  }
  const route = data.routes?.[0]
  if (!route?.distanceMeters) {
    return json(404, { configured: true, error: 'No encontramos una ruta entre esas direcciones' })
  }

  const duration = seconds(route.duration)
  const staticDuration = seconds(route.staticDuration)
  const tollInfo = route.travelAdvisory?.tollInfo
  const mxn = tollInfo?.estimatedPrice?.find((price) => price.currencyCode === 'MXN')
  // Centavos enteros: unidades × 100 + nanos ÷ 10⁷.
  const tollCents = mxn
    ? Number(mxn.units ?? 0) * 100 + Math.round((mxn.nanos ?? 0) / 10_000_000)
    : null

  return json(200, {
    configured: true,
    distance_m: route.distanceMeters,
    duration_s: duration,
    static_duration_s: staticDuration,
    // Hay casetas en la ruta, pero Google no siempre sabe el precio.
    has_tolls: Boolean(tollInfo),
    toll_cents: tollCents,
    // Si Google no dejó consultar casetas, se dice por qué.
    tolls_unavailable: tollsAsked ? null : firstError,
  })
})
