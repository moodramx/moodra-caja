// Transporte entre integrantes: lógica pura para la vista previa de un viaje y
// para saber quién le paga a quién. El servidor hace las mismas cuentas al
// guardar (insert_transport_detail y post_viaje); aquí son solo para mostrar.

export type Fuel = 'magna' | 'premium' | 'diesel'
export const FUEL_LABEL: Record<Fuel, string> = {
  magna: 'Magna',
  premium: 'Premium',
  diesel: 'Diésel',
}

export interface Rates {
  fuel_magna_cents: number
  fuel_premium_cents: number
  fuel_diesel_cents: number
  wear_cents_per_km: number
}
export const priceOf = (rates: Rates, fuel: Fuel) =>
  fuel === 'magna'
    ? rates.fuel_magna_cents
    : fuel === 'premium'
      ? rates.fuel_premium_cents
      : rates.fuel_diesel_cents

/** División entera redondeando al más cercano (mitades hacia arriba), como round() de Postgres. */
const roundDiv = (numerator: bigint, denominator: bigint) =>
  (numerator * 2n + denominator) / (denominator * 2n)

/** "12.5" km/l → 1250 (centésimas), sin pasar por float. */
export function kmplToHundredths(kmPerLiter: number | string): bigint {
  const [whole = '0', frac = ''] = String(kmPerLiter).split('.')
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2))
}

export interface CarInput {
  vehicleId: string
  ownerId: string
  kmPerLiter: number | string
  pricePerLiterCents: number
  tollCents: number
  tollPaidBy: string | null
}
export interface TripInput {
  /** Metros de un sentido. */
  distanceM: number
  roundTrip: boolean
  /** 0 a 50: cuánto más se gasta por el tráfico. */
  trafficPct: number
  wearCentsPerKm: number
  cars: CarInput[]
  /** Entre quiénes se reparte. */
  sharers: string[]
}

export interface CarCost {
  vehicleId: string
  fuel: bigint
  wear: bigint
  toll: bigint
  total: bigint
}

/** Gasolina estimada + desgaste + casetas de un auto. */
export function carCost(
  trip: Pick<TripInput, 'distanceM' | 'roundTrip' | 'trafficPct' | 'wearCentsPerKm'>,
  car: CarInput,
): CarCost {
  const meters = BigInt(trip.distanceM) * (trip.roundTrip ? 2n : 1n)
  const kmpl = kmplToHundredths(car.kmPerLiter)
  // litros = (m ÷ 1000) ÷ km/l; costo = litros × precio × (100 + tráfico) ÷ 100
  const fuel =
    kmpl > 0n
      ? roundDiv(
          meters * BigInt(car.pricePerLiterCents) * BigInt(100 + trip.trafficPct),
          1000n * kmpl,
        )
      : 0n
  const wear = roundDiv(meters * BigInt(trip.wearCentsPerKm), 1000n)
  const toll = BigInt(car.tollCents)
  return { vehicleId: car.vehicleId, fuel, wear, toll, total: fuel + wear + toll }
}

/** Partes iguales; los centavos que sobran van a los primeros (en orden de id, como el servidor). */
export function splitEvenly(total: bigint, members: string[]): Map<string, bigint> {
  const sorted = [...new Set(members)].sort()
  const out = new Map<string, bigint>()
  if (sorted.length === 0) return out
  const base = total / BigInt(sorted.length)
  const extra = Number(total % BigInt(sorted.length))
  sorted.forEach((member, i) => out.set(member, base + (i < extra ? 1n : 0n)))
  return out
}

export interface TripPreview {
  cars: CarCost[]
  total: bigint
  /** Lo que le toca a cada quien. */
  share: Map<string, bigint>
  /** Lo que puso cada quien (auto y casetas). */
  provided: Map<string, bigint>
  /** Positivo = debe; negativo = le deben. Suma cero. */
  net: Map<string, bigint>
}

export function previewTrip(trip: TripInput): TripPreview {
  const cars = trip.cars.map((car) => carCost(trip, car))
  const total = cars.reduce((sum, car) => sum + car.total, 0n)
  const share = splitEvenly(total, trip.sharers)
  const provided = new Map<string, bigint>()
  const add = (member: string, cents: bigint) =>
    provided.set(member, (provided.get(member) ?? 0n) + cents)
  trip.cars.forEach((car, i) => {
    const cost = cars[i]!
    add(car.ownerId, cost.fuel + cost.wear)
    if (cost.toll > 0n && car.tollPaidBy) add(car.tollPaidBy, cost.toll)
  })
  const net = new Map<string, bigint>()
  for (const member of new Set([...share.keys(), ...provided.keys()])) {
    net.set(member, (share.get(member) ?? 0n) - (provided.get(member) ?? 0n))
  }
  return { cars, total, share, provided, net }
}

export interface Transfer {
  from: string
  to: string
  cents: bigint
}

/**
 * Quién le paga a quién para quedar a mano con el menor número de pagos:
 * el que más debe le paga al que más le deben, y así hasta acabar.
 * `balances`: positivo = debe, negativo = le deben.
 */
export function settleUp(balances: { id: string; cents: bigint }[]): Transfer[] {
  const debtors = balances.filter((b) => b.cents > 0n).map((b) => ({ ...b }))
  const creditors = balances.filter((b) => b.cents < 0n).map((b) => ({ id: b.id, cents: -b.cents }))
  const byAmount = (a: { id: string; cents: bigint }, b: { id: string; cents: bigint }) =>
    a.cents === b.cents ? a.id.localeCompare(b.id) : b.cents > a.cents ? 1 : -1
  const out: Transfer[] = []
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmount)
    creditors.sort(byAmount)
    const debtor = debtors[0]!
    const creditor = creditors[0]!
    const cents = debtor.cents < creditor.cents ? debtor.cents : creditor.cents
    out.push({ from: debtor.id, to: creditor.id, cents })
    debtor.cents -= cents
    creditor.cents -= cents
    if (debtor.cents === 0n) debtors.shift()
    if (creditor.cents === 0n) creditors.shift()
  }
  return out
}

/** Ajuste de gasolina por tráfico que se sugiere: la mitad del tiempo extra, tope 30 %. */
export function suggestedTrafficPct(
  durationS: number | null,
  staticDurationS: number | null,
): number {
  if (!durationS || !staticDurationS || durationS <= staticDurationS) return 0
  return Math.min(30, Math.round(((durationS - staticDurationS) * 50) / staticDurationS))
}

/** "42.5" km → 42500 m; devuelve null si no es un número válido. */
export function kmToMeters(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(clean)) return null
  const [whole = '0', frac = ''] = clean.split('.')
  const meters = Number(whole) * 1000 + Number((frac + '000').slice(0, 3))
  return meters > 0 ? meters : null
}
export const metersToKm = (meters: number) =>
  `${Math.floor(meters / 1000)}.${String(Math.floor((meters % 1000) / 100))}`
