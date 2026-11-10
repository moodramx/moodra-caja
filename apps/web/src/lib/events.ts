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

export type SubmitPayload =
  GastoPayload | IngresoPayload | EntregaPayload | PuseDineroPayload | RegresoPayload

export type FeedRow = Database['public']['Views']['v_event_feed']['Row']
export type MemberBalance = Database['public']['Views']['v_member_balances']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectType = Database['public']['Tables']['project_types']['Row']
