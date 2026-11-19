// Viaje en curso: sigue al celular con el GPS mientras la app está abierta y
// guarda el recorrido en el dispositivo, para que no se pierda si la app se
// cierra o se recarga a medio camino. Es un solo viaje a la vez por celular.
import { useSyncExternalStore } from 'react'
import {
  addFix,
  emptyTrack,
  encodeRoute,
  sampleRoute,
  simplify,
  type LatLng,
  type Track,
} from './track'

export type TripPurpose = 'ensayo' | 'show' | 'otro'

export interface LiveTrip extends Track {
  status: 'active' | 'ended'
  startedAt: number
  endedAt: number | null
  purpose: TripPurpose
  showId: string | null
  carIds: string[]
}

export interface LiveState {
  trip: LiveTrip | null
  /** Última ubicación conocida (aunque no haya sumado distancia). */
  here: LatLng | null
  accuracy: number | null
  /** Por qué no hay ubicación, si es el caso. */
  problem: 'denied' | 'unavailable' | null
}

const KEY = 'moodra.viaje.v1'
/** Un viaje "en curso" de hace más de un día se da por terminado. */
const STALE_MS = 24 * 60 * 60 * 1000

let state: LiveState = { trip: null, here: null, accuracy: null, problem: null }
const listeners = new Set<() => void>()
let watchId: number | null = null
let wakeLock: { release: () => Promise<void> } | null = null
let unsaved = 0
let started = false

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function persist() {
  unsaved = 0
  try {
    if (state.trip) localStorage.setItem(KEY, JSON.stringify(state.trip))
    else localStorage.removeItem(KEY)
  } catch {
    // Sin espacio o en modo privado: el viaje sigue en memoria.
  }
}

function load(): LiveTrip | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const trip = JSON.parse(raw) as LiveTrip
    if (!Array.isArray(trip.points) || typeof trip.startedAt !== 'number') return null
    return trip
  } catch {
    return null
  }
}

async function keepScreenOn() {
  if (wakeLock || document.visibilityState !== 'visible') return
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null
  }
}
function letScreenSleep() {
  void wakeLock?.release().catch(() => undefined)
  wakeLock = null
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    // El sistema suelta el bloqueo de pantalla al salir de la app.
    wakeLock = null
    if (state.trip?.status === 'active') void keepScreenOn()
  } else if (state.trip) {
    persist()
  }
}

function watch() {
  if (watchId !== null) return
  if (!('geolocation' in navigator)) {
    set({ problem: 'unavailable' })
    return
  }
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const trip = state.trip
      if (!trip || trip.status !== 'active') return
      const { latitude, longitude, accuracy } = position.coords
      const next = addFix(trip, {
        lat: latitude,
        lng: longitude,
        accuracy,
        time: position.timestamp || Date.now(),
      })
      set({
        here: [latitude, longitude],
        accuracy,
        problem: null,
        trip: next === trip ? trip : { ...trip, ...next },
      })
      if (next !== trip && ++unsaved >= 5) persist()
    },
    (error) => {
      set({ problem: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' })
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
  )
  void keepScreenOn()
}

function unwatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  letScreenSleep()
}

/** Se llama una vez al abrir la app: retoma el viaje que estaba en curso. */
export function initLiveTrip() {
  if (started || typeof window === 'undefined') return
  started = true
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', () => state.trip && persist())
  const trip = load()
  if (!trip) return
  if (trip.status === 'active' && Date.now() - trip.startedAt > STALE_MS) {
    const last = trip.points.at(-1)
    set({ trip: { ...trip, status: 'ended', endedAt: last ? last[2] : trip.startedAt } })
    persist()
    return
  }
  set({ trip })
  if (trip.status === 'active') watch()
}

export function startLiveTrip(meta: Pick<LiveTrip, 'purpose' | 'showId' | 'carIds'>) {
  set({
    trip: { ...emptyTrack(), ...meta, status: 'active', startedAt: Date.now(), endedAt: null },
    problem: null,
  })
  persist()
  watch()
}

export function endLiveTrip() {
  if (!state.trip) return
  unwatch()
  set({ trip: { ...state.trip, status: 'ended', endedAt: Date.now() } })
  persist()
}

/** Por si se terminó sin querer: el viaje sigue donde iba. */
export function resumeLiveTrip() {
  if (!state.trip) return
  set({ trip: { ...state.trip, status: 'active', endedAt: null } })
  persist()
  watch()
}

export function clearLiveTrip() {
  unwatch()
  set({ trip: null, here: null, accuracy: null, problem: null })
  persist()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => state

export function useLiveTrip(): LiveState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Un viaje ya terminado, listo para revisarse y guardarse. */
export interface TrackedTrip {
  distanceM: number
  durationS: number
  startedAt: string
  endedAt: string
  /** Ruta simplificada (polilínea codificada). */
  path: string
  gaps: number
  /** Unos cuantos puntos de la ruta, para preguntar por sus casetas. */
  waypoints: LatLng[]
  purpose: TripPurpose
  showId: string | null
  carIds: string[]
}

export function trackedFrom(trip: LiveTrip): TrackedTrip {
  const ended = trip.endedAt ?? trip.points.at(-1)?.[2] ?? trip.startedAt
  const route = trip.points.map((p) => [p[0], p[1]] as LatLng)
  return {
    distanceM: Math.round(trip.distanceM),
    durationS: Math.max(0, Math.round((ended - trip.startedAt) / 1000)),
    startedAt: new Date(trip.startedAt).toISOString(),
    endedAt: new Date(ended).toISOString(),
    path: encodeRoute(route),
    gaps: trip.gaps,
    waypoints: sampleRoute(simplify(route, 30), 10),
    purpose: trip.purpose,
    showId: trip.showId,
    carIds: trip.carIds,
  }
}
