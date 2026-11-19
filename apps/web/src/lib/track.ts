// Seguimiento de un viaje con el GPS del celular: lógica pura (sin navegador)
// para medir lo recorrido, descartar lecturas malas y guardar la ruta.
// Las distancias van en metros; aquí sí hay decimales porque no es dinero.

/** [latitud, longitud, milisegundos desde 1970]. */
export type TrackPoint = [number, number, number]
export type LatLng = [number, number]

export interface Fix {
  lat: number
  lng: number
  /** Margen de error del GPS, en metros. */
  accuracy: number
  /** Milisegundos desde 1970. */
  time: number
}

export interface Track {
  points: TrackPoint[]
  /** Metros recorridos. */
  distanceM: number
  /** Veces que el celular dejó de dar ubicación y luego apareció lejos. */
  gaps: number
}
export const emptyTrack = (): Track => ({ points: [], distanceM: 0, gaps: 0 })

const RAD = Math.PI / 180
const EARTH_M = 6_371_000

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function haversineM(a: readonly number[], b: readonly number[]): number {
  const dLat = (b[0]! - a[0]!) * RAD
  const dLng = (b[1]! - a[1]!) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0]! * RAD) * Math.cos(b[0]! * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Lecturas con más error que esto no se toman en cuenta. */
export const MAX_ACCURACY_M = 60
/** Se guarda un punto cada vez que el auto avanzó al menos esto. */
export const MIN_STEP_M = 25
/** Más rápido que esto (250 km/h) es un brinco del GPS, no un auto. */
const MAX_SPEED_MS = 70
/** Un silencio de más de un minuto que termina a más de 400 m es un hueco. */
const GAP_MS = 60_000
const GAP_M = 400

/**
 * Suma una lectura del GPS al recorrido. Devuelve el mismo objeto si la
 * lectura no sirve (imprecisa, sin avance o un brinco imposible).
 */
export function addFix(track: Track, fix: Fix): Track {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return track
  if (!(fix.accuracy <= MAX_ACCURACY_M)) return track
  const last = track.points.at(-1)
  const point: TrackPoint = [round6(fix.lat), round6(fix.lng), fix.time]
  if (!last) return { ...track, points: [point] }
  const elapsed = fix.time - last[2]
  if (elapsed <= 0) return track
  const step = haversineM(last, point)
  // Parado en un semáforo el GPS "baila": no cuenta hasta que avance de verdad.
  if (step < Math.max(MIN_STEP_M, fix.accuracy)) return track
  if (step / (elapsed / 1000) > MAX_SPEED_MS) return track
  return {
    points: [...track.points, point],
    distanceM: track.distanceM + step,
    gaps: track.gaps + (elapsed > GAP_MS && step > GAP_M ? 1 : 0),
  }
}
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * Cuánto más se gasta de gasolina por ir lento, según la velocidad promedio
 * del viaje: nada a 45 km/h o más, y hasta 30 % a 15 km/h o menos.
 */
export function trafficPctFromSpeed(distanceM: number, durationS: number): number {
  if (!(distanceM > 0) || !(durationS > 0)) return 0
  const kmh = distanceM / 1000 / (durationS / 3600)
  return Math.max(0, Math.min(30, Math.round(45 - kmh)))
}

/** Quita puntos que no cambian la forma de la ruta (Douglas-Peucker). */
export function simplify(points: readonly LatLng[], toleranceM: number): LatLng[] {
  if (points.length <= 2) return points.map((p) => [p[0], p[1]])
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegmentM(points[i]!, points[first]!, points[last]!)
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index > 0 && worst > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => [p[0], p[1]])
}

/** Distancia de un punto a un tramo, en metros (plano local; sobra para una ciudad). */
function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111_320 * Math.cos(a[0] * RAD)
  const ky = 110_540
  const px = (p[1] - a[1]) * kx
  const py = (p[0] - a[0]) * ky
  const bx = (b[1] - a[1]) * kx
  const by = (b[0] - a[0]) * ky
  const length2 = bx * bx + by * by
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / length2))
  return Math.hypot(px - t * bx, py - t * by)
}

/** Ruta lista para guardar: simplificada hasta caber en `maxChars`. */
export function encodeRoute(points: readonly LatLng[], maxChars = 6000): string {
  let tolerance = 15
  let encoded = encodePolyline(simplify(points, tolerance))
  while (encoded.length > maxChars && tolerance < 2000) {
    tolerance *= 2
    encoded = encodePolyline(simplify(points, tolerance))
  }
  return encoded
}

/** Polilínea codificada (el formato de Google Maps, 5 decimales). */
export function encodePolyline(points: readonly LatLng[]): string {
  let out = ''
  let prevLat = 0
  let prevLng = 0
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5)
    const iLng = Math.round(lng * 1e5)
    out += encodeNumber(iLat - prevLat) + encodeNumber(iLng - prevLng)
    prevLat = iLat
    prevLng = iLng
  }
  return out
}
function encodeNumber(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  return out + String.fromCharCode(v + 63)
}

export function decodePolyline(text: string): LatLng[] {
  const out: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0
  const next = () => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = text.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index < text.length + 1)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < text.length) {
    lat += next()
    if (index >= text.length) break
    lng += next()
    out.push([lat / 1e5, lng / 1e5])
  }
  return out
}

/**
 * Hasta `count` puntos repartidos a lo largo de la ruta (siempre el primero y
 * el último), para pedirle a Google las casetas de la ruta que sí se tomó.
 */
export function sampleRoute(points: readonly LatLng[], count: number): LatLng[] {
  if (points.length <= count) return points.map((p) => [p[0], p[1]])
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineM(points[i - 1]!, points[i]!))
  }
  const total = cumulative.at(-1)!
  const out: LatLng[] = []
  let cursor = 0
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1)
    while (cursor < points.length - 1 && cumulative[cursor]! < target) cursor++
    const p = points[cursor]!
    const prev = out.at(-1)
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push([p[0], p[1]])
  }
  return out
}

/** 3725 s → "1 h 02 min"; 540 s → "9 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`
}
