// fuel-prices: pone en las tarifas el precio del litro de hoy, con los precios
// que las gasolineras reportan a la CRE (datos públicos). Toma la mediana de
// las estaciones del Valle de México. La llama el trabajo nocturno de GitHub y
// también la app al abrir Transporte; como mucho consulta a la CRE una vez
// cada 20 horas, así que llamarla de más no cuesta nada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const SOURCE = 'https://publicacionexterna.azurewebsites.net/publicaciones'
// Valle de México (CDMX y municipios conurbados).
const BOX = { south: 19.05, north: 19.9, west: -99.65, east: -98.85 }
const FRESH_MS = 20 * 60 * 60 * 1000
// Si la CRE falla, no se le vuelve a preguntar antes de una hora.
const RETRY_MS = 60 * 60 * 1000
const MIN_STATIONS = 30

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** "23.9" → 2390 centavos, sin pasar por decimales flotantes. */
export function toCents(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(text.trim())
  if (!match) return null
  const frac = ((match[2] ?? '') + '000').slice(0, 3)
  // Tercer decimal: se redondea al centavo.
  return Number(match[1]) * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Ids de las estaciones dentro de la zona. */
export function stationsInBox(placesXml: string): Set<string> {
  const ids = new Set<string>()
  const re =
    /<place place_id="(\d+)">[\s\S]*?<x>(-?[\d.]+)<\/x>\s*<y>(-?[\d.]+)<\/y>[\s\S]*?<\/place>/g
  for (const match of placesXml.matchAll(re)) {
    const lng = Number(match[2])
    const lat = Number(match[3])
    if (lat >= BOX.south && lat <= BOX.north && lng >= BOX.west && lng <= BOX.east) {
      ids.add(match[1]!)
    }
  }
  return ids
}

export function pricesOf(pricesXml: string, stations: Set<string>) {
  const found: Record<'regular' | 'premium' | 'diesel', number[]> = {
    regular: [],
    premium: [],
    diesel: [],
  }
  const placeRe = /<place place_id="(\d+)">([\s\S]*?)<\/place>/g
  const priceRe = /<gas_price type="(regular|premium|diesel)">([\d.]+)<\/gas_price>/g
  for (const place of pricesXml.matchAll(placeRe)) {
    if (!stations.has(place[1]!)) continue
    for (const price of place[2]!.matchAll(priceRe)) {
      const cents = toCents(price[2]!)
      // Fuera de 10 a 60 pesos es un error de captura de la gasolinera.
      if (cents !== null && cents >= 1000 && cents <= 6000) {
        found[price[1] as 'regular' | 'premium' | 'diesel'].push(cents)
      }
    }
  }
  return found
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'GET' && req.method !== 'POST') {
      return json(405, { error: 'Método no permitido' })
    }
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return json(500, { error: 'Función mal configurada' })
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: settings, error } = await admin
      .from('app_settings')
      .select('fuel_auto, fuel_updated_at, fuel_checked_at')
      .single()
    if (error || !settings) return json(500, { error: 'No se pudo leer la configuración' })
    if (!settings.fuel_auto) return json(200, { updated: false, reason: 'apagado' })

    const now = Date.now()
    const age = (iso: string | null) => (iso ? now - new Date(iso).getTime() : Infinity)
    if (age(settings.fuel_updated_at) < FRESH_MS) {
      return json(200, { updated: false, reason: 'al día' })
    }
    if (age(settings.fuel_checked_at) < RETRY_MS) {
      return json(200, { updated: false, reason: 'se intentó hace poco' })
    }
    // Se anota el intento antes de salir a la red: así las llamadas repetidas
    // no descargan los archivos de la CRE una y otra vez.
    await admin
      .from('app_settings')
      .update({ fuel_checked_at: new Date(now).toISOString() })
      .eq('id', true)

    try {
      const get = async (name: string) => {
        const response = await fetch(`${SOURCE}/${name}`, { signal: AbortSignal.timeout(40_000) })
        if (!response.ok) throw new Error(`CRE ${name}: ${response.status}`)
        return await response.text()
      }
      const [placesXml, pricesXml] = await Promise.all([get('places'), get('prices')])
      const found = pricesOf(pricesXml, stationsInBox(placesXml))
      const count = Math.min(found.regular.length, found.premium.length, found.diesel.length)
      if (count < MIN_STATIONS) throw new Error(`Solo ${count} gasolineras con precio`)
      const magna = median(found.regular)!
      const premium = median(found.premium)!
      const diesel = median(found.diesel)!
      const { data: applied, error: applyError } = await admin.rpc('apply_fuel_prices', {
        p_magna_cents: magna,
        p_premium_cents: premium,
        p_diesel_cents: diesel,
        p_source: `CRE · mediana de ${found.regular.length} gasolineras del Valle de México`,
      })
      if (applyError) throw new Error(applyError.message)
      return json(200, { updated: Boolean(applied), magna, premium, diesel })
    } catch (cause) {
      console.error('fuel-prices', cause)
      return json(200, {
        updated: false,
        reason: 'la CRE no respondió',
        detail: String(cause instanceof Error ? cause.message : cause).slice(0, 200),
      })
    }
  })
}
