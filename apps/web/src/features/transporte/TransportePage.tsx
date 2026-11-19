// Transporte entre integrantes: quién puso auto y tag en cada viaje, cuánto
// costó (gasolina estimada + desgaste + casetas) y cuánto se deben entre sí.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type { ViajePayload } from '../../lib/events'
import { formatMXN, formatMXNShort } from '../../lib/money'
import {
  usePlaces,
  useProfiles,
  useProjects,
  useSettings,
  useShows,
  useTransportBalances,
  useTrips,
  useVehicles,
} from '../../lib/queries'
import { showsForSale } from '../../lib/shows'
import { supabase } from '../../lib/supabase'
import {
  FUEL_LABEL,
  kmToMeters,
  metersToKm,
  previewTrip,
  priceOf,
  PURPOSES,
  settleUp,
  suggestedTrafficPct,
  type Fuel,
  type Rates,
} from '../../lib/transport'
import { clearLiveTrip, trackedFrom, useLiveTrip, type TrackedTrip } from '../../lib/liveTrip'
import { decodePolyline, formatDuration, trafficPctFromSpeed } from '../../lib/track'
import { fieldClass, useCapture } from '../captura/parts'
import { LiveTripCard, SavedTripMap, StartTripForm } from './LiveTrip'

const FUELS: Fuel[] = ['magna', 'premium', 'diesel']
type Purpose = (typeof PURPOSES)[number]['key']
const FUEL_CHECK_KEY = 'moodra.gasolina'
const FUEL_CHECK_MS = 6 * 60 * 60 * 1000

/** "123.45" → 12345 centavos, o null si no es un monto. Vacío = 0. */
function pesosToCents(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return 0
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null
  const [whole = '0', frac = ''] = clean.split('.')
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2))
}
const centsToPesos = (cents: number) => {
  const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  return text.endsWith('.00') ? text.slice(0, -3) : text
}
const errorText = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'No se pudo guardar'

function useRates(): Rates | null {
  const settings = useSettings()
  const data = settings.data
  // La configuración guardada en el celular puede ser de una versión anterior,
  // sin tarifas: se espera a la nueva en vez de hacer cuentas con datos a medias.
  if (
    !data ||
    typeof data.fuel_magna_cents !== 'number' ||
    typeof data.fuel_premium_cents !== 'number' ||
    typeof data.fuel_diesel_cents !== 'number' ||
    typeof data.wear_cents_per_km !== 'number'
  )
    return null
  return data
}

export function TransportePage() {
  const [sheet, setSheet] = useState<'iniciar' | 'viaje' | 'gps' | 'auto' | 'tarifas' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const vehicles = useVehicles()
  const profiles = useProfiles()
  const settings = useSettings()
  const rates = useRates()
  const live = useLiveTrip()
  const nameOf = (id: string | null | undefined) =>
    profiles.data?.find((p) => p.id === id)?.display_name ?? 'Alguien'
  const cars = (vehicles.data ?? []).filter((v) => v.active)
  const ended = live.trip?.status === 'ended' ? live.trip : null
  const tracked = useMemo(() => (ended ? trackedFrom(ended) : null), [ended])

  // El precio de la gasolina se actualiza solo (datos de la CRE). El servidor
  // decide si ya toca; aquí solo se le avisa de vez en cuando.
  useEffect(() => {
    if (!navigator.onLine) return
    try {
      if (Date.now() - Number(localStorage.getItem(FUEL_CHECK_KEY) ?? 0) < FUEL_CHECK_MS) return
      localStorage.setItem(FUEL_CHECK_KEY, String(Date.now()))
    } catch {
      return
    }
    void supabase.functions.invoke('fuel-prices', { method: 'GET' }).then(({ data }) => {
      if ((data as { updated?: boolean } | null)?.updated) {
        void queryClient.invalidateQueries({ queryKey: ['settings'] })
      }
    })
  }, [queryClient])

  return (
    <Page number="04" title="Transporte">
      <LiveTripCard
        rates={rates}
        cars={cars}
        onStart={() => setSheet('iniciar')}
        onManual={() => setSheet('viaje')}
        onReview={() => setSheet('gps')}
      />
      {vehicles.data && cars.length === 0 && (
        <p className="text-center text-ink-muted">Primero da de alta un auto.</p>
      )}

      <Balances nameOf={nameOf} />

      <Trips nameOf={nameOf} />

      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Autos</p>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null)
              setSheet('auto')
            }}
          >
            Agregar auto
          </Button>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {cars.map((car) => (
            <li key={car.id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 text-left"
                onClick={() => {
                  setEditing(car.id)
                  setSheet('auto')
                }}
              >
                <span>
                  <span className="block font-semibold">{car.name}</span>
                  <span className="text-sm text-ink-muted">
                    De {nameOf(car.owner_id)} · {FUEL_LABEL[car.fuel]} · {car.km_per_liter} km por
                    litro
                  </span>
                </span>
                <span aria-hidden="true" className="text-ink-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {rates && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Tarifas</p>
            <Button variant="secondary" onClick={() => setSheet('tarifas')}>
              Cambiar
            </Button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {FUELS.map((fuel) => (
              <div key={fuel} className="flex justify-between gap-2">
                <dt className="text-ink-muted">{FUEL_LABEL[fuel]}</dt>
                <dd className="tabular-nums">{formatMXN(BigInt(priceOf(rates, fuel)))} / litro</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Desgaste</dt>
              <dd className="tabular-nums">{formatMXN(BigInt(rates.wear_cents_per_km))} / km</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-ink-muted">
            {settings.data?.fuel_auto === false
              ? 'La gasolina se pone a mano.'
              : `La gasolina se actualiza sola cada día con los precios de las gasolineras del Valle de México${
                  settings.data?.fuel_updated_at
                    ? ` (última vez: ${new Date(settings.data.fuel_updated_at).toLocaleDateString(
                        'es-MX',
                        { day: 'numeric', month: 'short' },
                      )})`
                    : ''
                }.`}
          </p>
        </Card>
      )}

      <BottomSheet
        open={sheet === 'iniciar'}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Iniciar viaje"
        description="La app mide el camino real mientras van."
      >
        <StartTripForm cars={cars} onDone={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet
        open={sheet === 'viaje'}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Viaje a mano"
        description="Para un viaje que no se siguió en el mapa."
      >
        {rates && <TripForm rates={rates} onDone={() => setSheet(null)} />}
      </BottomSheet>
      <BottomSheet
        open={sheet === 'gps' && tracked !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Guardar viaje"
        description="Su costo se reparte entre los integrantes."
      >
        {rates && tracked && (
          <TripForm rates={rates} tracked={tracked} onDone={() => setSheet(null)} />
        )}
      </BottomSheet>
      <BottomSheet
        open={sheet === 'auto'}
        onOpenChange={(open) => !open && setSheet(null)}
        title={editing ? 'Editar auto' : 'Agregar auto'}
      >
        <VehicleForm
          key={editing ?? 'nuevo'}
          vehicle={(vehicles.data ?? []).find((v) => v.id === editing) ?? null}
          onDone={() => setSheet(null)}
        />
      </BottomSheet>
      <BottomSheet
        open={sheet === 'tarifas'}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Tarifas"
        description="Precio por litro y desgaste por kilómetro. Aplican a los viajes nuevos."
      >
        {rates && (
          <RatesForm
            rates={rates}
            fuelAuto={settings.data?.fuel_auto !== false}
            onDone={() => setSheet(null)}
          />
        )}
      </BottomSheet>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Saldos y pagos entre integrantes
// ---------------------------------------------------------------------------
function Balances({ nameOf }: { nameOf: (id: string | null | undefined) => string }) {
  const { session, profile } = useAuth()
  const balances = useTransportBalances()
  const capture = useCapture()
  const userId = session?.user.id
  const rows = (balances.data ?? []).filter(
    (row) => row.member_id && (row.activo || row.balance_cents),
  )
  const mine = BigInt(rows.find((row) => row.member_id === userId)?.balance_cents ?? 0)
  const transfers = settleUp(
    rows.map((row) => ({ id: row.member_id!, cents: BigInt(row.balance_cents ?? 0) })),
  )

  return (
    <Card>
      <p className="label-mono text-ink-muted">Cuentas de transporte</p>
      <p className={`display mt-2 text-3xl tabular-nums ${mine < 0n ? 'text-in' : ''}`}>
        {mine === 0n
          ? 'Estás a mano'
          : mine > 0n
            ? `Debes ${formatMXNShort(mine)}`
            : `Te deben ${formatMXNShort(-mine)}`}
      </p>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((row) => {
          const cents = BigInt(row.balance_cents ?? 0)
          return (
            <li key={row.member_id} className="flex justify-between gap-3 py-2">
              <span>
                {row.emoji} {row.display_name}
              </span>
              <span
                className={`tabular-nums ${cents < 0n ? 'text-in' : cents > 0n ? '' : 'text-ink-muted'}`}
              >
                {cents === 0n
                  ? 'a mano'
                  : cents > 0n
                    ? `debe ${formatMXNShort(cents)}`
                    : `le deben ${formatMXNShort(-cents)}`}
              </span>
            </li>
          )
        })}
      </ul>
      {transfers.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="font-semibold">Para quedar a mano</p>
          <ul className="mt-2 space-y-2">
            {transfers.map((transfer) => {
              const canRecord =
                profile?.role === 'contador' || userId === transfer.from || userId === transfer.to
              return (
                <li
                  key={`${transfer.from}-${transfer.to}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    {nameOf(transfer.from)} le paga{' '}
                    <strong className="tabular-nums">{formatMXNShort(transfer.cents)}</strong> a{' '}
                    {nameOf(transfer.to)}
                  </span>
                  {canRecord && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void capture(
                          'pago_transporte',
                          {
                            amount_cents: Number(transfer.cents),
                            from_member: transfer.from,
                            to_member: transfer.to,
                          },
                          'Pago registrado ✓',
                        )
                      }
                    >
                      Ya se pagó
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Trips({ nameOf }: { nameOf: (id: string | null | undefined) => string }) {
  const trips = useTrips()
  const [open, setOpen] = useState<string | null>(null)
  const rows = (trips.data ?? []).filter((trip) => trip.status === 'registrado')
  if (trips.data && rows.length === 0) {
    return (
      <EmptyState
        emoji="🛣️"
        title="Sin viajes todavía"
        hint="Registra el primero con el botón de arriba."
      />
    )
  }
  return (
    <Card>
      <p className="font-semibold">Viajes</p>
      <ul className="mt-2 divide-y divide-line">
        {rows.map((trip) => {
          const km = ((trip.distance_m ?? 0) * (trip.round_trip ? 2 : 1)) / 1000
          const cars = (trip.cars ?? []) as {
            vehicle_name: string
            owner_id: string
            fuel_cents: number
            wear_cents: number
            toll_cents: number
            toll_paid_by: string | null
          }[]
          return (
            <li key={trip.event_id}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
                aria-expanded={open === trip.event_id}
                onClick={() => setOpen(open === trip.event_id ? null : trip.event_id)}
              >
                <span>
                  <span className="block font-semibold">
                    {trip.origin_name} → {trip.dest_name}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {new Date(trip.captured_at ?? '').toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {trip.tracked
                      ? 'medido por GPS'
                      : trip.round_trip
                        ? 'ida y vuelta'
                        : 'solo ida'}{' '}
                    · {km.toFixed(1)} km
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMXNShort(BigInt(trip.total_cents ?? 0))}
                </span>
              </button>
              {open === trip.event_id && (
                <ul className="space-y-1 pb-3 text-sm text-ink-muted">
                  {trip.path && (
                    <li>
                      <SavedTripMap points={decodePolyline(trip.path)} />
                    </li>
                  )}
                  {trip.tracked && trip.duration_s ? (
                    <li>
                      Duró {formatDuration(trip.duration_s)}
                      {trip.traffic_pct
                        ? ` · ${trip.traffic_pct} % extra de gasolina por tráfico`
                        : ''}
                      .
                    </li>
                  ) : null}
                  {cars.map((car) => (
                    <li key={car.vehicle_name}>
                      {car.vehicle_name} (de {nameOf(car.owner_id)}): gasolina{' '}
                      {formatMXN(BigInt(car.fuel_cents))} + desgaste{' '}
                      {formatMXN(BigInt(car.wear_cents))}
                      {car.toll_cents > 0 &&
                        ` · casetas ${formatMXN(BigInt(car.toll_cents))} (las pagó ${nameOf(car.toll_paid_by)})`}
                    </li>
                  ))}
                  <li>
                    Entre {(trip.sharers ?? []).length}:{' '}
                    {(trip.sharers ?? []).map((id) => nameOf(id)).join(', ')}.
                  </li>
                  <li>Para anularlo, búscalo en Movimientos.</li>
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Nuevo viaje
// ---------------------------------------------------------------------------
interface PlaceValue {
  id: string | null
  name: string
  address: string
}
const emptyPlace: PlaceValue = { id: null, name: '', address: '' }

function PlaceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: PlaceValue
  onChange: (value: PlaceValue) => void
}) {
  const places = usePlaces()
  const [custom, setCustom] = useState(false)
  const saved = places.data ?? []
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {saved.map((place) => (
          <Chip
            key={place.id}
            selected={!custom && value.id === place.id}
            onClick={() => {
              setCustom(false)
              onChange({ id: place.id, name: place.name, address: place.address })
            }}
          >
            {place.name}
          </Chip>
        ))}
        <Chip
          selected={custom || saved.length === 0}
          onClick={() => {
            setCustom(true)
            onChange(emptyPlace)
          }}
        >
          Otro lugar
        </Chip>
      </div>
      {(custom || saved.length === 0) && (
        <div className="space-y-2">
          <input
            className={fieldClass}
            aria-label={`${label}: nombre del lugar`}
            placeholder="Nombre (Sala de ensayo, Casa de Pepe…)"
            value={value.name}
            onChange={(event) => onChange({ ...value, id: null, name: event.target.value })}
          />
          <input
            className={fieldClass}
            aria-label={`${label}: dirección`}
            placeholder="Dirección (calle, número, colonia, ciudad)"
            value={value.address}
            onChange={(event) => onChange({ ...value, id: null, address: event.target.value })}
          />
        </div>
      )}
      {!custom && value.id && <p className="text-sm text-ink-muted">{value.address}</p>}
    </fieldset>
  )
}

interface CarState {
  riders: string[]
  toll: string
  tollPaidBy: string | null
}

function TripForm({
  rates,
  tracked = null,
  onDone,
}: {
  rates: Rates
  /** Viaje seguido en el mapa: la distancia y el tiempo ya vienen medidos. */
  tracked?: TrackedTrip | null
  onDone: () => void
}) {
  const capture = useCapture()
  const queryClient = useQueryClient()
  const profiles = useProfiles()
  const vehicles = useVehicles()
  const projects = useProjects()
  const shows = useShows()

  const members = (profiles.data ?? []).filter((p) => p.activo)
  const cars = (vehicles.data ?? []).filter((v) => v.active)

  const [purpose, setPurpose] = useState<Purpose>(tracked?.purpose ?? 'ensayo')
  const [showId, setShowId] = useState<string | null>(tracked?.showId ?? null)
  const [origin, setOrigin] = useState<PlaceValue>(emptyPlace)
  const [dest, setDest] = useState<PlaceValue>(emptyPlace)
  const [roundTrip, setRoundTrip] = useState(!tracked)
  const [km, setKm] = useState(tracked ? (tracked.distanceM / 1000).toFixed(2) : '')
  const [duration, setDuration] = useState<number | null>(tracked?.durationS ?? null)
  const [traffic, setTraffic] = useState(
    tracked ? String(trafficPctFromSpeed(tracked.distanceM, tracked.durationS)) : '0',
  )
  const [routing, setRouting] = useState(false)
  const [routeNote, setRouteNote] = useState('')
  const [selected, setSelected] = useState<Record<string, CarState>>(() =>
    Object.fromEntries(
      cars
        .filter((car) => tracked?.carIds.includes(car.id))
        .map((car) => [car.id, { riders: [car.owner_id], toll: '', tollPaidBy: car.owner_id }]),
    ),
  )
  const [sharers, setSharers] = useState<string[] | null>(null)

  // Por defecto se reparte entre quienes participan en los repartos de la banda.
  const defaultSharers = useMemo(
    () => (profiles.data ?? []).filter((p) => p.activo && p.participa_reparto).map((p) => p.id),
    [profiles.data],
  )
  const sharing = sharers ?? defaultSharers
  const showOptions = showsForSale(shows.data ?? [], showId)
  const rehearsals = (projects.data ?? []).find((p) => p.type?.code === 'ENS')

  const distanceM = kmToMeters(km)
  const trafficPct = /^\d{1,2}$/.test(traffic) ? Math.min(Number(traffic), 50) : 0
  const chosen = cars.filter((car) => selected[car.id])
  const tolls = chosen.map((car) => pesosToCents(selected[car.id]!.toll))
  const preview =
    distanceM && chosen.length > 0 && sharing.length > 0 && !tolls.includes(null)
      ? previewTrip({
          distanceM,
          roundTrip,
          trafficPct,
          wearCentsPerKm: rates.wear_cents_per_km,
          sharers: sharing,
          cars: chosen.map((car, i) => ({
            vehicleId: car.id,
            ownerId: car.owner_id,
            kmPerLiter: car.km_per_liter,
            pricePerLiterCents: priceOf(rates, car.fuel),
            tollCents: tolls[i] ?? 0,
            tollPaidBy: selected[car.id]!.tollPaidBy ?? car.owner_id,
          })),
        })
      : null
  const nameOf = (id: string) => members.find((p) => p.id === id)?.display_name ?? 'Alguien'

  const missing = !origin.name.trim()
    ? 'Falta el punto de salida'
    : !dest.name.trim()
      ? 'Falta el destino'
      : purpose === 'show' && !showId
        ? 'Elige el show'
        : !distanceM
          ? 'Faltan los kilómetros'
          : chosen.length === 0
            ? 'Elige al menos un auto'
            : tolls.includes(null)
              ? 'Revisa el monto de casetas'
              : sharing.length === 0
                ? 'Elige entre quiénes se reparte'
                : null

  const toggleCar = (id: string, ownerId: string) =>
    setSelected((current) => {
      const next = { ...current }
      if (next[id]) delete next[id]
      else next[id] = { riders: [ownerId], toll: '', tollPaidBy: ownerId }
      return next
    })
  const patchCar = (id: string, patch: Partial<CarState>) =>
    setSelected((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }))

  const askGoogle = async () => {
    setRouting(true)
    setRouteNote('')
    try {
      const { data, error } = await supabase.functions.invoke('route-estimate', {
        body: tracked
          ? { points: tracked.waypoints }
          : { origin: origin.address, destination: dest.address },
      })
      // Cuando la función responde con error, el motivo viene en el cuerpo de la respuesta.
      let failure: unknown = null
      if (error) {
        try {
          failure = await (error as { context?: Response }).context?.json()
        } catch {
          failure = null
        }
      }
      const result = (data ?? failure ?? {}) as {
        configured?: boolean
        distance_m?: number
        duration_s?: number | null
        static_duration_s?: number | null
        has_tolls?: boolean
        tolls_unavailable?: string | null
        toll_cents?: number | null
        error?: string
      }
      if (tracked) {
        // La distancia ya la midió el GPS: de Google solo interesan las casetas.
        const toll = result.toll_cents ?? 0
        const first = chosen[0]
        if (error || result.error || !result.configured) {
          setRouteNote(
            `No se pudieron consultar las casetas${result.error ? ` (${result.error})` : ''}. Ponlas a mano con lo que cobró el tag.`,
          )
        } else {
          if (toll > 0 && first) patchCar(first.id, { toll: centsToPesos(toll) })
          const off =
            result.distance_m &&
            Math.abs(result.distance_m - tracked.distanceM) > tracked.distanceM * 0.15
              ? ` Ojo: por esa ruta Google mide ${(result.distance_m / 1000).toFixed(1)} km; si el celular perdió la ubicación, corrige los kilómetros.`
              : ''
          setRouteNote(
            (toll > 0
              ? `Casetas de la ruta que tomaron: ${formatMXN(BigInt(toll))}${first ? ' (puestas en el primer auto; corrígelas con lo que cobró el tag).' : '.'}`
              : result.tolls_unavailable
                ? `Google no dejó consultar casetas (${result.tolls_unavailable}): ponlas a mano.`
                : result.has_tolls
                  ? 'Hay casetas en la ruta pero Google no sabe el precio: ponlas a mano.'
                  : 'La ruta que tomaron no tiene casetas.') + off,
          )
        }
      } else if (error || result.error) {
        setRouteNote(result.error ?? 'No se pudo calcular la ruta. Pon los kilómetros a mano.')
      } else if (!result.configured) {
        setRouteNote(
          'Google Maps todavía no está conectado. Pon los kilómetros y las casetas a mano.',
        )
      } else if (result.distance_m) {
        setKm(metersToKm(result.distance_m))
        setDuration(result.duration_s ?? null)
        setTraffic(
          String(suggestedTrafficPct(result.duration_s ?? null, result.static_duration_s ?? null)),
        )
        const minutes = result.duration_s
          ? ` · ${Math.round(result.duration_s / 60)} min con el tráfico de ahorita`
          : ''
        const tollOneWay = result.toll_cents ?? 0
        const toll = tollOneWay * (roundTrip ? 2 : 1)
        const first = chosen[0]
        if (toll > 0 && first) patchCar(first.id, { toll: centsToPesos(toll) })
        setRouteNote(
          `Ruta de Google: ${metersToKm(result.distance_m)} km por sentido${minutes}.` +
            (toll > 0
              ? ` Casetas estimadas: ${formatMXN(BigInt(toll))}${first ? ' (puestas en el primer auto; corrígelas con lo que cobró el tag).' : '.'}`
              : result.tolls_unavailable
                ? ` Google no dejó consultar casetas (${result.tolls_unavailable}): ponlas a mano.`
                : result.has_tolls
                  ? ' Hay casetas pero Google no sabe el precio: ponlas a mano.'
                  : ' Sin casetas.'),
        )
      }
    } catch {
      setRouteNote(
        tracked ? 'Sin señal: pon las casetas a mano.' : 'Sin señal: pon los kilómetros a mano.',
      )
    } finally {
      setRouting(false)
    }
  }

  // Al terminar un viaje seguido en el mapa se preguntan sus casetas una vez.
  const asked = useRef(false)
  useEffect(() => {
    if (!tracked || asked.current || tracked.waypoints.length < 2 || !navigator.onLine) return
    asked.current = true
    void askGoogle()
    // Solo al abrir el resumen del viaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    if (missing || !distanceM) return
    const payload: ViajePayload = {
      origin_name: origin.name.trim(),
      origin_address: origin.address.trim() || undefined,
      dest_name: dest.name.trim(),
      dest_address: dest.address.trim() || undefined,
      purpose,
      round_trip: tracked ? false : roundTrip,
      ...(tracked
        ? {
            tracked: true,
            started_at: tracked.startedAt,
            ended_at: tracked.endedAt,
            path: tracked.path || undefined,
            gaps: tracked.gaps,
          }
        : {}),
      distance_m: distanceM,
      duration_s: duration,
      traffic_pct: trafficPct,
      wear_cents_per_km: rates.wear_cents_per_km,
      sharers: sharing,
      show_id: purpose === 'show' ? showId : null,
      project_id: purpose === 'ensayo' ? (rehearsals?.id ?? null) : null,
      cars: chosen.map((car, i) => ({
        vehicle_id: car.id,
        riders: selected[car.id]!.riders,
        price_per_liter_cents: priceOf(rates, car.fuel),
        toll_cents: tolls[i] ?? 0,
        toll_paid_by: (tolls[i] ?? 0) > 0 ? (selected[car.id]!.tollPaidBy ?? car.owner_id) : null,
      })),
    }
    void capture('viaje', payload, 'Viaje guardado ✓')
    if (tracked) clearLiveTrip()
    // Los lugares nuevos con dirección se guardan para la próxima (si hay señal).
    for (const place of [origin, dest]) {
      if (!place.id && place.name.trim() && place.address.trim().length >= 3) {
        void supabase
          .rpc('save_place', {
            p_id: null as unknown as string,
            p_name: place.name,
            p_address: place.address,
          })
          .then(() => queryClient.invalidateQueries({ queryKey: ['places'] }))
      }
    }
    onDone()
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="font-semibold">¿A qué fueron?</legend>
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

      <PlaceField label="Salida" value={origin} onChange={setOrigin} />
      <PlaceField label="Destino" value={dest} onChange={setDest} />

      <fieldset className="space-y-2">
        <legend className="font-semibold">Recorrido</legend>
        {tracked ? (
          <>
            <p>
              El GPS midió{' '}
              <strong className="tabular-nums">{(tracked.distanceM / 1000).toFixed(1)} km</strong>{' '}
              en {formatDuration(tracked.durationS)}.
            </p>
            {tracked.gaps > 0 && (
              <p className="text-sm text-ink-muted">
                ⚠️ El celular dejó de dar ubicación{' '}
                {tracked.gaps === 1 ? 'una vez' : `${tracked.gaps} veces`}: revisa los kilómetros.
              </p>
            )}
            <p className="text-sm text-ink-muted">
              Este viaje es de un solo sentido; el regreso se inicia como otro viaje.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Chip selected={roundTrip} onClick={() => setRoundTrip(true)}>
              Ida y vuelta
            </Chip>
            <Chip selected={!roundTrip} onClick={() => setRoundTrip(false)}>
              Solo ida
            </Chip>
          </div>
        )}
        <Button
          variant="secondary"
          block
          disabled={
            routing ||
            (tracked
              ? tracked.waypoints.length < 2
              : origin.address.trim().length < 3 || dest.address.trim().length < 3)
          }
          onClick={() => void askGoogle()}
        >
          {routing
            ? 'Calculando…'
            : tracked
              ? '🧾 Calcular casetas de esta ruta'
              : '🗺️ Calcular ruta con Google'}
        </Button>
        {routeNote && (
          <p role="status" className="text-sm text-ink-muted">
            {routeNote}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-ink-muted">
              {tracked ? 'Km recorridos' : 'Km por sentido'}
            </span>
            <input
              className={fieldClass}
              inputMode="decimal"
              placeholder="0.0"
              value={km}
              onChange={(event) => setKm(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-muted">Extra por tráfico (%)</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              value={traffic}
              onChange={(event) => setTraffic(event.target.value.replace(/\D/g, '').slice(0, 2))}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-semibold">¿En qué autos?</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Autos">
          {cars.map((car) => (
            <Chip
              key={car.id}
              emoji="🚗"
              selected={Boolean(selected[car.id])}
              onClick={() => toggleCar(car.id, car.owner_id)}
            >
              {car.name}
            </Chip>
          ))}
        </div>
        {chosen.map((car) => {
          const state = selected[car.id]!
          return (
            <div key={car.id} className="space-y-3 rounded-card border border-line bg-bg p-3">
              <p className="font-semibold">
                {car.name}{' '}
                <span className="font-normal text-ink-muted">
                  · de {nameOf(car.owner_id)} · {FUEL_LABEL[car.fuel]}
                </span>
              </p>
              <div role="group" aria-label={`Quiénes iban en ${car.name}`} className="space-y-1">
                <p className="text-sm text-ink-muted">¿Quiénes iban?</p>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => (
                    <Chip
                      key={member.id}
                      selected={state.riders.includes(member.id)}
                      onClick={() =>
                        patchCar(car.id, {
                          riders: state.riders.includes(member.id)
                            ? state.riders.filter((id) => id !== member.id)
                            : [...state.riders, member.id],
                        })
                      }
                    >
                      {member.display_name}
                    </Chip>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-sm text-ink-muted">
                  Casetas / tag de este auto (total del viaje, en pesos)
                </span>
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`Casetas de ${car.name}`}
                  value={state.toll}
                  onChange={(event) => patchCar(car.id, { toll: event.target.value })}
                />
              </label>
              {(pesosToCents(state.toll) ?? 0) > 0 && (
                <div
                  role="group"
                  aria-label={`Quién pagó el tag de ${car.name}`}
                  className="space-y-1"
                >
                  <p className="text-sm text-ink-muted">¿De quién es el tag?</p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((member) => (
                      <Chip
                        key={member.id}
                        selected={(state.tollPaidBy ?? car.owner_id) === member.id}
                        onClick={() => patchCar(car.id, { tollPaidBy: member.id })}
                      >
                        {member.display_name}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Se reparte entre</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Se reparte entre">
          {members.map((member) => (
            <Chip
              key={member.id}
              selected={sharing.includes(member.id)}
              onClick={() =>
                setSharers(
                  sharing.includes(member.id)
                    ? sharing.filter((id) => id !== member.id)
                    : [...sharing, member.id],
                )
              }
            >
              {member.display_name}
            </Chip>
          ))}
        </div>
      </fieldset>

      {preview && (
        <div
          className="space-y-2 rounded-card border border-line bg-surface-2 p-3"
          aria-label="Cuentas del viaje"
        >
          <p className="flex justify-between gap-3 font-semibold">
            <span>Costo del viaje</span>
            <span className="tabular-nums">{formatMXN(preview.total)}</span>
          </p>
          <ul className="text-sm text-ink-muted">
            {chosen.map((car, i) => {
              const cost = preview.cars[i]!
              return (
                <li key={car.id}>
                  {car.name}: gasolina {formatMXN(cost.fuel)} + desgaste {formatMXN(cost.wear)}
                  {cost.toll > 0n && ` + casetas ${formatMXN(cost.toll)}`}
                </li>
              )
            })}
          </ul>
          <ul className="divide-y divide-line border-t border-line">
            {[...preview.net.entries()].map(([member, cents]) => (
              <li key={member} className="flex justify-between gap-3 py-1.5">
                <span>{nameOf(member)}</span>
                <span className={`tabular-nums ${cents < 0n ? 'text-in' : ''}`}>
                  {cents === 0n
                    ? 'queda a mano'
                    : cents > 0n
                      ? `pone ${formatMXN(cents)}`
                      : `recibe ${formatMXN(-cents)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing && <p className="text-center text-sm text-ink-muted">{missing}</p>}
      <Button size="lg" block disabled={Boolean(missing)} onClick={save}>
        Guardar viaje
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Autos y tarifas
// ---------------------------------------------------------------------------
function VehicleForm({
  vehicle,
  onDone,
}: {
  vehicle: { id: string; owner_id: string; name: string; fuel: Fuel; km_per_liter: number } | null
  onDone: () => void
}) {
  const { session } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const profiles = useProfiles()
  const members = (profiles.data ?? []).filter((p) => p.activo)
  const [name, setName] = useState(vehicle?.name ?? '')
  const [owner, setOwner] = useState<string | null>(vehicle?.owner_id ?? session?.user.id ?? null)
  const [fuel, setFuel] = useState<Fuel>(vehicle?.fuel ?? 'magna')
  const [kmpl, setKmpl] = useState(vehicle ? String(vehicle.km_per_liter) : '')
  const [busy, setBusy] = useState(false)

  const value = Number(kmpl.replace(',', '.'))
  const valid =
    name.trim().length > 0 &&
    owner !== null &&
    /^\d{1,2}([.,]\d{1,2})?$/.test(kmpl.trim()) &&
    value >= 1 &&
    value <= 60

  const save = async (active: boolean) => {
    if (!owner) return
    setBusy(true)
    const { error } = await supabase.rpc('save_vehicle', {
      p_id: (vehicle?.id ?? null) as unknown as string,
      p_owner: owner,
      p_name: name,
      p_fuel: fuel,
      p_km_per_liter: value,
      p_active: active,
    })
    setBusy(false)
    if (error) {
      toast({ message: errorText(error) })
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['vehicles'] })
    toast({ message: active ? 'Auto guardado ✓' : 'Auto dado de baja' })
    onDone()
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm text-ink-muted">Nombre del auto</span>
        <input
          className={fieldClass}
          placeholder="Versa gris, la camioneta de Ram…"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div role="group" aria-label="Dueño" className="space-y-1">
        <p className="text-sm text-ink-muted">¿De quién es?</p>
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <Chip
              key={member.id}
              selected={owner === member.id}
              onClick={() => setOwner(member.id)}
            >
              {member.display_name}
            </Chip>
          ))}
        </div>
      </div>
      <div role="group" aria-label="Combustible" className="space-y-1">
        <p className="text-sm text-ink-muted">¿Qué le pone?</p>
        <div className="flex flex-wrap gap-2">
          {FUELS.map((option) => (
            <Chip key={option} selected={fuel === option} onClick={() => setFuel(option)}>
              {FUEL_LABEL[option]}
            </Chip>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-sm text-ink-muted">Rendimiento (km por litro)</span>
        <input
          className={fieldClass}
          inputMode="decimal"
          placeholder="12"
          value={kmpl}
          onChange={(event) => setKmpl(event.target.value)}
        />
        <span className="mt-1 block text-sm text-ink-muted">
          Si no lo sabes: un auto chico anda en 12 a 15; una camioneta, en 8 a 10.
        </span>
      </label>
      <Button size="lg" block disabled={!valid || busy} onClick={() => void save(true)}>
        Guardar auto
      </Button>
      {vehicle && (
        <Button variant="danger" block disabled={busy} onClick={() => void save(false)}>
          Dar de baja
        </Button>
      )}
    </div>
  )
}

function RatesForm({
  rates,
  fuelAuto,
  onDone,
}: {
  rates: Rates
  fuelAuto: boolean
  onDone: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [auto, setAuto] = useState(fuelAuto)
  const [values, setValues] = useState({
    magna: centsToPesos(rates.fuel_magna_cents),
    premium: centsToPesos(rates.fuel_premium_cents),
    diesel: centsToPesos(rates.fuel_diesel_cents),
    wear: centsToPesos(rates.wear_cents_per_km),
  })
  const [busy, setBusy] = useState(false)
  const cents = {
    magna: pesosToCents(values.magna),
    premium: pesosToCents(values.premium),
    diesel: pesosToCents(values.diesel),
    wear: pesosToCents(values.wear),
  }
  const valid =
    (auto || Boolean(cents.magna && cents.premium && cents.diesel)) && cents.wear !== null

  const save = async () => {
    setBusy(true)
    // Con la gasolina automática solo se guarda el desgaste; los precios los pone el servidor.
    let { error } = await supabase.rpc('set_transport_rates', {
      p_magna_cents: auto ? rates.fuel_magna_cents : (cents.magna ?? 0),
      p_premium_cents: auto ? rates.fuel_premium_cents : (cents.premium ?? 0),
      p_diesel_cents: auto ? rates.fuel_diesel_cents : (cents.diesel ?? 0),
      p_wear_cents_per_km: cents.wear ?? 0,
    })
    if (!error && auto !== fuelAuto) {
      error = (await supabase.rpc('set_fuel_auto', { p_auto: auto })).error
      // Al encenderla, que se consulte el precio de hoy en la próxima visita.
      try {
        localStorage.removeItem(FUEL_CHECK_KEY)
      } catch {
        // Sin almacenamiento local no pasa nada.
      }
    }
    setBusy(false)
    if (error) {
      toast({ message: errorText(error) })
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
    toast({ message: 'Tarifas guardadas ✓' })
    onDone()
  }

  const field = (key: keyof typeof values, label: string) => (
    <label className="block">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        className={fieldClass}
        inputMode="decimal"
        value={values[key]}
        onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      />
    </label>
  )

  return (
    <div className="space-y-4">
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          className="size-6 accent-current"
          checked={auto}
          onChange={(event) => setAuto(event.target.checked)}
        />
        <span>
          <span className="block font-semibold">Actualizar la gasolina sola cada día</span>
          <span className="text-sm text-ink-muted">
            Con los precios que las gasolineras del Valle de México reportan a la CRE.
          </span>
        </span>
      </label>
      {!auto && (
        <>
          {field('magna', 'Magna (pesos por litro)')}
          {field('premium', 'Premium (pesos por litro)')}
          {field('diesel', 'Diésel (pesos por litro)')}
        </>
      )}
      {field('wear', 'Desgaste del auto (pesos por km)')}
      <p className="text-sm text-ink-muted">
        El desgaste cubre llantas, servicio y demás; se le reconoce al dueño del auto en cada viaje.
      </p>
      <Button size="lg" block disabled={!valid || busy} onClick={() => void save()}>
        Guardar tarifas
      </Button>
    </div>
  )
}
