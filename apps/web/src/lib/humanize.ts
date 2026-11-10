// Todo el texto que ve un integrante sobre el dinero, en lenguaje humano.
// Regla: aquí nunca aparecen palabras de contabilidad.
import type {
  EntregaPayload,
  FeedRow,
  GastoPayload,
  IngresoPayload,
  MoneyPlace,
  PuseDineroPayload,
  RegresoPayload,
} from './events'
import { formatMXNShort } from './money'

const money = (cents: number | bigint) => formatMXNShort(BigInt(cents))

export const PAID_WITH_OPTIONS = [
  { value: 'efectivo_banda', emoji: '💵', label: 'Efectivo de la banda que traigo' },
  { value: 'mi_dinero', emoji: '🙋', label: 'Mi dinero' },
  { value: 'cuenta_banda', emoji: '🏦', label: 'Cuenta de la banda (transferencia)' },
  { value: 'pendiente', emoji: '⏳', label: 'Quedó pendiente de pagar' },
] as const

export const SETTLEMENT_OPTIONS = [
  { value: 'reembolso', emoji: '↩️', label: 'Regrésenmelo' },
  { value: 'compensar_reparto', emoji: '➗', label: 'Descuéntalo del próximo reparto' },
  { value: 'aportacion', emoji: '🎁', label: 'Es aportación, no me lo regresen' },
] as const

export const INCOME_PLACE_OPTIONS = [
  { value: 'efectivo_integrante', emoji: '💵', label: 'Lo traigo yo en efectivo' },
  { value: 'cuenta_banda', emoji: '🏦', label: 'Llegó a la cuenta de la banda' },
  { value: 'caja', emoji: '🧰', label: 'Lo guardé en la caja' },
] as const

const paidWithPhrase: Record<GastoPayload['paid_with'], string> = {
  efectivo_banda: 'con efectivo de la banda',
  mi_dinero: 'con tu dinero',
  cuenta_banda: 'con la cuenta de la banda',
  caja: 'con dinero de la caja',
  pendiente: 'y quedó pendiente de pagar',
}

const settlementPhrase: Record<NonNullable<GastoPayload['settlement_pref']>, string> = {
  reembolso: 'Te lo regresamos.',
  compensar_reparto: 'Se descuenta de tu próximo reparto.',
  aportacion: 'Queda como aportación tuya.',
}

const placePhrase: Record<MoneyPlace, string> = {
  efectivo_integrante: 'Lo traes tú en efectivo.',
  cuenta_banda: 'Llegó a la cuenta de la banda.',
  caja: 'Quedó guardado en la caja.',
}

interface Named {
  emoji: string
  name: string
}

export function describeGasto(
  payload: GastoPayload,
  category: Named,
  contextName?: string,
): string {
  const where = contextName ? ` para ${contextName}` : ''
  const how = paidWithPhrase[payload.paid_with]
  const after = payload.settlement_pref ? ` ${settlementPhrase[payload.settlement_pref]}` : ''
  return `Gastaste ${money(payload.amount_cents)} en ${category.emoji} ${category.name}${where}, ${how}.${after}`
}

export function describeIngreso(payload: IngresoPayload, category: Named): string {
  return `Cobraste ${money(payload.amount_cents)} de ${category.emoji} ${category.name}. ${placePhrase[payload.destination]}`
}

export function describeEntrega(payload: EntregaPayload, receiverName?: string): string {
  const amount = money(payload.amount_cents)
  if (payload.to_kind === 'integrante') {
    return `Le pasaste ${amount} a ${receiverName ?? 'alguien'}. Cuenta en cuanto confirme que lo recibió.`
  }
  if (payload.to_kind === 'caja') return `Entregaste ${amount} a la caja de la banda.`
  return `Depositaste ${amount} en la cuenta de la banda.`
}

export function describePuse(payload: PuseDineroPayload, holderName?: string): string {
  const where =
    payload.destination === 'cuenta_banda'
      ? 'en la cuenta de la banda'
      : payload.destination === 'caja'
        ? 'en la caja'
        : holderName
          ? `y se lo diste a ${holderName}`
          : 'en efectivo'
  const after = payload.kind === 'prestamo' ? 'Te lo regresamos.' : 'Queda como aportación tuya.'
  return `Pusiste ${money(payload.amount_cents)} ${where}. ${after}`
}

const originPhrase: Record<MoneyPlace, string> = {
  efectivo_integrante: 'con el efectivo de la banda que traes',
  cuenta_banda: 'desde la cuenta de la banda',
  caja: 'con dinero de la caja',
}

/** "Le regresaste $500 a Pepe desde la cuenta de la banda. Todavía le debemos $350." */
export function describeRegreso(
  payload: RegresoPayload,
  name: string,
  owedCents: bigint,
  isSelf = false,
): string {
  const rest = owedCents - BigInt(payload.amount_cents)
  const whom = isSelf ? 'Te regresaste' : `Le regresaste`
  const to = isSelf ? '' : ` a ${name}`
  const after =
    rest > 0n
      ? isSelf
        ? `Todavía te debemos ${money(rest)}.`
        : `Todavía le debemos ${money(rest)}.`
      : isSelf
        ? 'Ya estás a mano con la banda.'
        : `Ya estamos a mano con ${name}.`
  return `${whom} ${money(payload.amount_cents)}${to} ${originPhrase[payload.origin]}. ${after}`
}

const pieces = (n: number | null) => `${n ?? 0} ${n === 1 ? 'pza' : 'pzas'}`

/** "Vendiste 3 pzas por $700 en efectivo (1 de regalo)." */
export function describeVenta(
  totals: { pieces: number; giftPieces: number; total: bigint },
  method: 'efectivo' | 'transferencia',
): string {
  const paid = totals.pieces - totals.giftPieces
  const gift = totals.giftPieces ? ` (${totals.giftPieces} de regalo)` : ''
  if (paid === 0) return `Regalaste ${pieces(totals.pieces)}.`
  return `Vendiste ${pieces(totals.pieces)} por ${money(totals.total)} ${method === 'efectivo' ? 'en efectivo' : 'por transferencia'}${gift}.`
}

export interface FeedText {
  emoji: string
  title: string
  /** Estado en palabras, si no es un movimiento normal ya contado. */
  badge?: 'por confirmar' | 'rechazado' | 'anulado'
}

/** Un renglón del feed: "Pepe gastó $850 en Transporte". */
export function feedText(row: FeedRow, nameOf: (id: string | null) => string): FeedText {
  const who = nameOf(row.created_by)
  const amount = money(row.amount_cents ?? 0)
  const badge =
    row.status === 'pendiente_confirmacion'
      ? 'por confirmar'
      : row.status === 'rechazado'
        ? 'rechazado'
        : row.status === 'anulado'
          ? 'anulado'
          : undefined

  switch (row.type) {
    case 'gasto':
      return {
        emoji: row.category_emoji ?? '💸',
        title: `${who} gastó ${amount} en ${row.category_name ?? 'algo'}`,
        badge,
      }
    case 'ingreso':
      return {
        emoji: row.category_emoji ?? '💵',
        title: `${who} cobró ${amount} · ${row.category_name ?? ''}`,
        badge,
      }
    case 'entrega_efectivo': {
      const to =
        row.to_kind === 'integrante'
          ? `a ${nameOf(row.to_member)}`
          : row.to_kind === 'caja'
            ? 'a la caja'
            : 'a la cuenta de la banda'
      const verb =
        row.to_kind === 'banco' ? 'depositó' : row.to_kind === 'caja' ? 'entregó' : 'le pasó'
      return { emoji: '🤝', title: `${who} ${verb} ${amount} ${to}`, badge }
    }
    case 'puse_dinero':
      return {
        emoji: '🏦',
        title: `${who} puso ${amount}${row.fund_kind === 'aportacion' ? ' como aportación' : ''}`,
        badge,
      }
    case 'venta_merch':
      return {
        emoji: '👕',
        title: `${who} vendió ${pieces(row.pieces)} de merch · ${amount}`,
        badge,
      }
    case 'compra_merch':
      return {
        emoji: '📦',
        title: `${who} metió ${pieces(row.pieces)} de merch · ${amount}`,
        badge,
      }
    case 'salida_merch':
      return row.stock_kind === 'merma'
        ? { emoji: '🗑️', title: `Se dieron de baja ${pieces(row.pieces)} de merch`, badge }
        : { emoji: '🎁', title: `${who} regaló ${pieces(row.pieces)} de merch`, badge }
    case 'ajuste_inventario':
      return { emoji: '🔢', title: `${who} contó el merch y corrigió ${pieces(row.pieces)}`, badge }
    case 'regreso_dinero':
      return {
        emoji: '↩️',
        title: `Se le regresaron ${amount} a ${nameOf(row.fund_member)}`,
        badge,
      }
    case 'pago_proveedor':
      return { emoji: '✅', title: `${who} pagó ${amount} que estaban pendientes`, badge }
    default:
      return { emoji: '🔁', title: `Se ajustaron ${amount} de ${nameOf(row.fund_member)}`, badge }
  }
}

/** "hace 5 min", "hoy 14:30", "ayer", "12 nov". */
export function timeAgo(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'ahorita'
  if (minutes < 60) return `hace ${minutes} min`
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `hoy ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'ayer'
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
