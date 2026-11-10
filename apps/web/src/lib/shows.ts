// Cálculos de shows (mismos que la base, para mostrarlos antes de guardar).

/** División entera redondeando al más cercano (como round() de Postgres). */
function roundDiv(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (b * 2n)
}

/** Porcentajes con hasta dos decimales, como entero de centésimas: 70 → 7000. */
const basisPoints = (pct: number) => BigInt(Math.round(pct * 100))

/** Parte de la taquilla que le toca a la banda. */
export function shareOf(grossCents: bigint, pct: number): bigint {
  return roundDiv(grossCents * basisPoints(pct), 10000n)
}

/** Comisión de la boletera: % del bruto más un fijo por boleto. */
export function commissionFor(
  grossCents: bigint,
  tickets: number,
  pct: number,
  fixedCents: bigint,
): bigint {
  return roundDiv(grossCents * basisPoints(pct), 10000n) + BigInt(tickets) * fixedCents
}

/** Boletos que hay que vender para no perder: costos ÷ lo que deja cada boleto. */
export function breakEvenTickets(costsCents: bigint, netPerTicketCents: bigint): number | null {
  if (netPerTicketCents <= 0n) return null
  return Number((costsCents + netPerTicketCents - 1n) / netPerTicketCents)
}

interface ShowLike {
  id: string
  date: string
  status: string
}

/**
 * Shows que se ofrecen al cobrar merch "de show": los de estos días (3 antes
 * o después de hoy), más el ya elegido. Si no hay ninguno cerca, los 5 más
 * recientes. Nunca los cancelados.
 */
export function showsForSale<T extends ShowLike>(
  all: T[],
  selectedId: string | null,
  today = new Date(),
): T[] {
  const day = 86_400_000
  const now = Date.parse(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(today),
  )
  const live = all.filter((show) => show.status !== 'cancelado')
  const near = live.filter((show) => Math.abs(Date.parse(show.date) - now) <= 3 * day)
  const base =
    near.length > 0 ? near : [...live].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5)
  const selected = live.find((show) => show.id === selectedId)
  return selected && !base.includes(selected) ? [selected, ...base] : base
}
