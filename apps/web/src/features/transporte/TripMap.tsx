// Mapa de un viaje (Leaflet con mapas de OpenStreetMap). Se carga aparte, solo
// cuando hace falta, para no engordar el arranque de la app.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../../lib/track'

const CDMX: LatLng = [19.4326, -99.1332]

interface TripMapProps {
  /** Ruta recorrida. */
  points: readonly (readonly number[])[]
  /** Dónde está el celular ahorita (solo en un viaje en curso). */
  here?: LatLng | null
  /** En vivo: el mapa sigue al auto. Si no, encuadra toda la ruta y no se mueve. */
  live?: boolean
  className?: string
}

export default function TripMap({ points, here = null, live = false, className }: TripMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const line = useRef<L.Polyline | null>(null)
  const dot = useRef<L.CircleMarker | null>(null)
  const startDot = useRef<L.CircleMarker | null>(null)
  const following = useRef(true)
  const [detached, setDetached] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, {
      center: CDMX,
      zoom: live ? 15 : 12,
      zoomControl: live,
      dragging: live,
      touchZoom: live,
      doubleClickZoom: live,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: live,
      attributionControl: true,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance)
    line.current = L.polyline([], { color: '#111111', weight: 5, opacity: 0.85 }).addTo(instance)
    instance.on('dragstart', () => {
      following.current = false
      setDetached(true)
    })
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      line.current = null
      dot.current = null
      startDot.current = null
    }
  }, [live])

  useEffect(() => {
    const instance = map.current
    if (!instance || !line.current) return
    const path = points.map((p) => [p[0]!, p[1]!] as LatLng)
    line.current.setLatLngs(path)
    const first = path[0]
    if (first) {
      if (!startDot.current) {
        startDot.current = L.circleMarker(first, {
          radius: 6,
          color: '#111111',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(instance)
      } else startDot.current.setLatLng(first)
    }
    const position = here ?? (live ? path.at(-1) : null) ?? null
    if (position) {
      if (!dot.current) {
        dot.current = L.circleMarker(position, {
          radius: 9,
          color: '#ffffff',
          weight: 3,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).addTo(instance)
      } else dot.current.setLatLng(position)
    }
    if (live) {
      if (position && following.current) instance.setView(position, instance.getZoom())
    } else if (path.length > 1) {
      instance.fitBounds(L.latLngBounds(path), { padding: [24, 24] })
      const last = path.at(-1)!
      if (!dot.current) {
        dot.current = L.circleMarker(last, {
          radius: 6,
          color: '#111111',
          weight: 2,
          fillColor: '#111111',
          fillOpacity: 1,
        }).addTo(instance)
      }
    } else if (first) {
      instance.setView(first, 15)
    }
  }, [points, here, live])

  return (
    <div className={`relative isolate overflow-hidden rounded-card ${className ?? ''}`}>
      <div ref={container} className="size-full" role="img" aria-label="Mapa del viaje" />
      {live && detached && (
        <button
          type="button"
          className="absolute right-3 bottom-6 z-[1000] min-h-11 rounded-full border border-line bg-surface px-4 font-semibold shadow"
          onClick={() => {
            following.current = true
            setDetached(false)
            const position = here ?? null
            if (position && map.current) map.current.setView(position, map.current.getZoom())
          }}
        >
          Centrar
        </button>
      )}
    </div>
  )
}
