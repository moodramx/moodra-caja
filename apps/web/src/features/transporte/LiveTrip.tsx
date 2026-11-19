// Viaje en vivo: "Iniciar viaje", mapa con el recorrido mientras van en camino
// y "Terminar viaje". Lo recorrido de verdad es lo que se cobra.
import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card } from '../../design/Page'
import { useAuth } from '../../lib/auth'
import {
  clearLiveTrip,
  endLiveTrip,
  resumeLiveTrip,
  startLiveTrip,
  useLiveTrip,
  type TripPurpose,
} from '../../lib/liveTrip'
import { formatMXNShort } from '../../lib/money'
import { useShows } from '../../lib/queries'
import { showsForSale } from '../../lib/shows'
import { formatDuration, trafficPctFromSpeed, type LatLng } from '../../lib/track'
import { carCost, priceOf, PURPOSES, type Fuel, type Rates } from '../../lib/transport'

const TripMap = lazy(() => import('./TripMap'))

export interface Car {
  id: string
  owner_id: string
  name: string
  fuel: Fuel
  km_per_liter: number
}

const km = (meters: number) => (meters / 1000).toFixed(meters < 100_000 ? 1 : 0)

function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  return now
}

function MapBox({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid h-72 place-items-center rounded-card bg-surface-2 text-ink-muted">
          Cargando el mapa…
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

export function LiveTripCard({
  rates,
  cars,
  onStart,
  onManual,
  onReview,
}: {
  rates: Rates | null
  cars: Car[]
  onStart: () => void
  onManual: () => void
  onReview: () => void
}) {
  const live = useLiveTrip()
  const trip = live.trip
  const now = useNow(trip?.status === 'active')
  const [confirming, setConfirming] = useState(false)

  if (!trip) {
    return (
      <div className="space-y-2">
        <Button size="lg" block onClick={onStart} disabled={cars.length === 0 || !rates}>
          ▶ Iniciar viaje
        </Button>
        <Button variant="secondary" block onClick={onManual} disabled={cars.length === 0 || !rates}>
          Registrar un viaje a mano
        </Button>
      </div>
    )
  }

  const active = trip.status === 'active'
  const seconds = Math.max(0, ((active ? now : (trip.endedAt ?? now)) - trip.startedAt) / 1000)
  const traffic = trafficPctFromSpeed(trip.distanceM, seconds)
  const cost = rates
    ? cars
        .filter((car) => trip.carIds.includes(car.id))
        .reduce(
          (sum, car) =>
            sum +
            carCost(
              {
                distanceM: Math.round(trip.distanceM),
                roundTrip: false,
                trafficPct: traffic,
                wearCentsPerKm: rates.wear_cents_per_km,
              },
              {
                vehicleId: car.id,
                ownerId: car.owner_id,
                kmPerLiter: car.km_per_liter,
                pricePerLiterCents: priceOf(rates, car.fuel),
                tollCents: 0,
                tollPaidBy: null,
              },
            ).total,
          0n,
        )
    : 0n

  const gps =
    live.problem === 'denied'
      ? 'La app no tiene permiso de ubicación. Actívalo en los ajustes del navegador y vuelve a abrirla.'
      : live.problem === 'unavailable'
        ? 'No hay señal de GPS por ahora. Sigue intentando…'
        : !live.here
          ? 'Buscando tu ubicación…'
          : live.accuracy && live.accuracy > 60
            ? 'La ubicación todavía es imprecisa…'
            : null

  return (
    <Card>
      <p className="label-mono text-ink-muted">{active ? 'Viaje en curso' : 'Viaje terminado'}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="display text-4xl tabular-nums" aria-label="Kilómetros recorridos">
          {km(trip.distanceM)} <span className="text-xl">km</span>
        </p>
        <p className="text-right tabular-nums">
          <span className="block font-semibold">{formatDuration(seconds)}</span>
          <span className="text-sm text-ink-muted">
            {cost > 0n ? `${formatMXNShort(cost)} sin casetas` : 'sin costo todavía'}
          </span>
        </p>
      </div>

      <div className="mt-3">
        <MapBox>
          <TripMap
            key={active ? 'vivo' : 'fin'}
            points={trip.points}
            here={active ? live.here : null}
            live={active}
            className="h-72"
          />
        </MapBox>
      </div>

      {active && gps && (
        <p role="status" className="mt-2 text-sm text-ink-muted">
          {gps}
        </p>
      )}
      {trip.gaps > 0 && (
        <p className="mt-2 text-sm text-ink-muted">
          ⚠️ El celular dejó de dar ubicación {trip.gaps === 1 ? 'una vez' : `${trip.gaps} veces`}:
          en esos tramos se midió en línea recta. Al terminar puedes corregir los kilómetros.
        </p>
      )}

      {active ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink-muted">
            Deja la app abierta durante el camino: si la cierras o bloqueas el celular, deja de
            medir.
          </p>
          <Button size="lg" block onClick={endLiveTrip}>
            ■ Terminar viaje
          </Button>
          {confirming ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Seguir
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false)
                  clearLiveTrip()
                }}
              >
                Sí, cancelar
              </Button>
            </div>
          ) : (
            <Button variant="secondary" block onClick={() => setConfirming(true)}>
              Cancelar viaje
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Button size="lg" block onClick={onReview} disabled={trip.distanceM < 1}>
            Revisar y guardar
          </Button>
          {trip.distanceM < 1 && (
            <p className="text-center text-sm text-ink-muted">
              No se midió ningún recorrido. Puedes seguir el viaje o registrarlo a mano.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={resumeLiveTrip}>
              Seguir el viaje
            </Button>
            {confirming ? (
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false)
                  clearLiveTrip()
                }}
              >
                Sí, descartar
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

/** Lo mínimo antes de arrancar; lo demás se confirma al llegar. */
export function StartTripForm({ cars, onDone }: { cars: Car[]; onDone: () => void }) {
  const { session } = useAuth()
  const shows = useShows()
  const [purpose, setPurpose] = useState<TripPurpose>('ensayo')
  const [showId, setShowId] = useState<string | null>(null)
  const [carIds, setCarIds] = useState<string[]>(() => {
    const mine = cars.filter((car) => car.owner_id === session?.user.id)
    return mine.length === 1 ? [mine[0]!.id] : cars.length === 1 ? [cars[0]!.id] : []
  })
  const showOptions = showsForSale(shows.data ?? [], showId)
  const missing =
    carIds.length === 0 ? 'Elige el auto' : purpose === 'show' && !showId ? 'Elige el show' : null

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-semibold">¿A qué van?</legend>
        <div className="flex flex-wrap gap-2">
          {PURPOSES.map((option) => (
            <Chip
              key={option.key}
              emoji={option.emoji}
              selected={purpose === option.key}
              onClick={() => setPurpose(option.key)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        {purpose === 'show' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {showOptions.length === 0 && (
              <p className="text-ink-muted">No hay shows dados de alta.</p>
            )}
            {showOptions.map((show) => (
              <Chip key={show.id} selected={showId === show.id} onClick={() => setShowId(show.id)}>
                {show.name}
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">¿En qué auto?</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Autos">
          {cars.map((car) => (
            <Chip
              key={car.id}
              emoji="🚗"
              selected={carIds.includes(car.id)}
              onClick={() =>
                setCarIds(
                  carIds.includes(car.id)
                    ? carIds.filter((id) => id !== car.id)
                    : [...carIds, car.id],
                )
              }
            >
              {car.name}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          Si van en dos autos por caminos distintos, cada auto inicia su viaje en un celular.
        </p>
      </fieldset>

      <p className="text-sm text-ink-muted">
        La app va a pedir permiso de ubicación y mide lo que de verdad recorran, aunque cambien de
        ruta. Quién iba, las casetas y entre quiénes se reparte se confirman al llegar.
      </p>
      {missing && <p className="text-center text-sm text-ink-muted">{missing}</p>}
      <Button
        size="lg"
        block
        disabled={Boolean(missing)}
        onClick={() => {
          startLiveTrip({ purpose, showId: purpose === 'show' ? showId : null, carIds })
          onDone()
        }}
      >
        Empezar viaje
      </Button>
    </div>
  )
}

/** Mapa chico de un viaje ya guardado. */
export function SavedTripMap({ points }: { points: LatLng[] }) {
  return (
    <Suspense fallback={<div className="h-44 rounded-card bg-surface-2" />}>
      <TripMap points={points} className="h-44" />
    </Suspense>
  )
}
