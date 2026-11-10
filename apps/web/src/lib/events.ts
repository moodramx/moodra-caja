// Formas de los eventos que captura el usuario (payload de la RPC submit_event).
import type { Database } from './database.types'

type Enums = Database['public']['Enums']
export type EventType = Enums['event_type']
export type EventStatus = Enums['event_status']
export type PaidWith = Enums['paid_with']
export type SettlementPref = Enums['settlement_pref']
export type MoneyPlace = Enums['money_place']
export type TransferParty = Enums['transfer_party']

interface Base {
  /** Centavos. Viaja como número JSON (seguro hasta 2^53). */
  amount_cents: number
  project_id?: string | null
  /** Show al que corresponde (si no va, el servidor lo deduce del proyecto). */
  show_id?: string | null
  description?: string
}

export interface GastoPayload extends Base {
  category_id: string
  paid_with: PaidWith
  settlement_pref?: SettlementPref
}

export interface IngresoPayload extends Base {
  category_id: string
  destination: MoneyPlace
}

export interface EntregaPayload extends Base {
  to_kind: TransferParty
  to_member?: string
  from_kind?: 'integrante' | 'caja'
  note?: string
}

export interface PuseDineroPayload extends Base {
  destination: MoneyPlace
  holder_member_id?: string
  kind: 'prestamo' | 'aportacion'
}

/** Regresarle a un integrante dinero que la banda le debe. */
export interface RegresoPayload extends Base {
  member_id: string
  origin: MoneyPlace
}

export type PaymentMethod = Enums['payment_method']
export type SaleChannel = Enums['sale_channel']

export interface SaleLine {
  variant_id: string
  qty: number
  /** Precio al que se cobró (el de la caché al momento de vender). */
  unit_price_cents: number
  is_gift: boolean
}

export interface VentaPayload {
  lines: SaleLine[]
  payment_method: PaymentMethod
  channel: SaleChannel
  /** Canal "otro": a qué se refiere. */
  channel_note?: string
  collected_by?: string
  project_id?: string | null
  show_id?: string | null
}

export interface CompraPayload {
  lines: { variant_id: string; qty: number; unit_cost_cents: number }[]
  /** Con qué se pagó. No aplica al saldo inicial. */
  paid_with?: PaidWith
  /** Saldo inicial: lo que la banda ya tenía antes de usar la app (solo contador). */
  opening?: boolean
  settlement_pref?: SettlementPref
  description?: string
  project_id?: string | null
  show_id?: string | null
}

/** Regalo fuera de venta o merma. */
export interface SalidaPayload {
  kind: 'regalo' | 'merma'
  variant_id: string
  qty: number
  note?: string
  project_id?: string | null
  show_id?: string | null
}

export interface AjustePayload {
  variant_id: string
  counted_qty: number
  note?: string
}

/** Un auto de un viaje: quiénes iban, a cuánto el litro y las casetas. */
export interface TripCarPayload {
  vehicle_id: string
  riders: string[]
  price_per_liter_cents: number
  toll_cents: number
  toll_paid_by?: string | null
}

/** Viaje a un ensayo o a un show; su costo se reparte entre integrantes. */
export interface ViajePayload {
  origin_name: string
  origin_address?: string
  dest_name: string
  dest_address?: string
  purpose: 'ensayo' | 'show' | 'otro'
  round_trip: boolean
  /** Metros de un sentido. */
  distance_m: number
  duration_s?: number | null
  traffic_pct: number
  wear_cents_per_km: number
  sharers: string[]
  cars: TripCarPayload[]
  project_id?: string | null
  show_id?: string | null
  note?: string
}

/** Un integrante le paga a otro lo que le debe de transporte. */
export interface PagoTransportePayload {
  amount_cents: number
  from_member: string
  to_member: string
}

/** Reparto entre quienes participan (solo contador). */
export interface RepartoPayload {
  amount_cents: number
  note?: string
}
export interface PagoRepartoPayload {
  amount_cents: number
  member_id: string
  origin: MoneyPlace
  holder_member_id?: string
}
/** Conteo de efectivo: la caja o lo que trae un integrante. */
export interface ArqueoPayload {
  place: 'caja' | 'efectivo_integrante'
  member_id?: string
  counted_cents: number
  note?: string
}
export interface AsientoManualPayload {
  reason: string
  lines: { account_id: string; debit_cents?: number; credit_cents?: number; memo?: string }[]
}
/** Pagar algo que quedó pendiente con un proveedor o tercero. */
export interface PagoProveedorPayload {
  amount_cents: number
  origin: MoneyPlace
  description?: string
}
/** Convertir lo que se le debe a alguien en aportación, o al revés (solo contador). */
export interface ReclasificacionPayload {
  amount_cents: number
  member_id: string
  direction: 'a_aportacion' | 'a_prestamo'
}

export type SubmitPayload =
  | GastoPayload
  | IngresoPayload
  | EntregaPayload
  | PuseDineroPayload
  | RegresoPayload
  | VentaPayload
  | CompraPayload
  | SalidaPayload
  | AjustePayload
  | CierrePayload
  | AnticipoPayload
  | CobroPendientePayload
  | ViajePayload
  | PagoTransportePayload
  | RepartoPayload
  | PagoRepartoPayload
  | ArqueoPayload
  | AsientoManualPayload
  | PagoProveedorPayload
  | ReclasificacionPayload

export type InventoryRow = Database['public']['Views']['v_inventory']['Row']

export type FeedRow = Database['public']['Views']['v_event_feed']['Row']
export type MemberBalance = Database['public']['Views']['v_member_balances']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectType = Database['public']['Tables']['project_types']['Row']

export type DealType = Enums['deal_type']

/** Cierre de show: lo que les pagaron según el trato y dónde quedó. */
export interface CierrePayload {
  show_id: string
  fee_cents?: number
  /** Parte de la taquilla que le tocó a la banda. */
  share_cents?: number
  /** Boletaje propio, bruto. */
  gross_cents?: number
  tickets_sold?: number
  commission_cents?: number
  platform_id?: string | null
  /** null = quedó pendiente de cobro. */
  destination?: MoneyPlace | null
}

export interface AnticipoPayload {
  show_id: string
  amount_cents: number
  destination: MoneyPlace
}

/** Llegó dinero que estaba por cobrar (venue o boletera). */
export interface CobroPendientePayload {
  amount_cents: number
  platform_id?: string
  destination: MoneyPlace
}
