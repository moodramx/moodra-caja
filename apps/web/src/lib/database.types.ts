
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"created_by": string | null,"id": string,"is_postable": boolean,"member_id": string | null,"member_kind": Database["public"]['Enums']["member_account_kind"] | null,"name": string,"nature": Database["public"]['Enums']["account_nature"],"parent_id": string | null,"type": Database["public"]['Enums']["account_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_postable"?: boolean,"member_id"?: string | null,"member_kind"?: Database["public"]['Enums']["member_account_kind"] | null,"name": string,"nature": Database["public"]['Enums']["account_nature"],"parent_id"?: string | null,"type": Database["public"]['Enums']["account_type"]
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_postable"?: boolean,"member_id"?: string | null,"member_kind"?: Database["public"]['Enums']["member_account_kind"] | null,"name"?: string,"nature"?: Database["public"]['Enums']["account_nature"],"parent_id"?: string | null,"type"?: Database["public"]['Enums']["account_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "accounts_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "accounts_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "active_project_id": string | null,"active_show_id": string | null,"cash_alert_days": number,"cash_alert_threshold_cents": number,"fuel_diesel_cents": number,"fuel_magna_cents": number,"fuel_premium_cents": number,"id": boolean,"timezone": string,"updated_at": string,"updated_by": string | null,"void_window_hours": number,"wear_cents_per_km": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active_project_id"?: string | null,"active_show_id"?: string | null,"cash_alert_days"?: number,"cash_alert_threshold_cents"?: number,"fuel_diesel_cents"?: number,"fuel_magna_cents"?: number,"fuel_premium_cents"?: number,"id"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"void_window_hours"?: number,"wear_cents_per_km"?: number
                  }
                  Update: {
                    "active_project_id"?: string | null,"active_show_id"?: string | null,"cash_alert_days"?: number,"cash_alert_threshold_cents"?: number,"fuel_diesel_cents"?: number,"fuel_magna_cents"?: number,"fuel_premium_cents"?: number,"id"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"void_window_hours"?: number,"wear_cents_per_km"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_active_project_fkey"
      columns: ["active_project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_settings_active_project_fkey"
      columns: ["active_project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "app_settings_active_show_fkey"
      columns: ["active_show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_settings_active_show_fkey"
      columns: ["active_show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "app_settings_active_show_fkey"
      columns: ["active_show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"device": string | null,"entity": string,"entity_id": string | null,"id": string,"payload": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"device"?: string | null,"entity": string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"device"?: string | null,"entity"?: string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "audit_log_actor_fkey"
      columns: ["actor"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"cash_transfers": {
                  Row: {
                    "amount_cents": number,"confirmed_at": string | null,"confirmed_by": string | null,"event_id": string,"from_kind": Database["public"]['Enums']["transfer_party"],"from_member": string | null,"note": string | null,"to_kind": Database["public"]['Enums']["transfer_party"],"to_member": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"event_id": string,"from_kind": Database["public"]['Enums']["transfer_party"],"from_member"?: string | null,"note"?: string | null,"to_kind": Database["public"]['Enums']["transfer_party"],"to_member"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"event_id"?: string,"from_kind"?: Database["public"]['Enums']["transfer_party"],"from_member"?: string | null,"note"?: string | null,"to_kind"?: Database["public"]['Enums']["transfer_party"],"to_member"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_transfers_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "account_general_id": string,"account_show_id": string | null,"active": boolean,"created_at": string,"created_by": string | null,"emoji": string,"id": string,"is_extra": boolean,"kind": Database["public"]['Enums']["category_kind"],"name": string,"slug": string,"sort": number,"visible_to": Database["public"]['Enums']["visible_to"]
                  }
                  ComputedFields: never
                  Insert: {
                    "account_general_id": string,"account_show_id"?: string | null,"active"?: boolean,"created_at"?: string,"created_by"?: string | null,"emoji": string,"id"?: string,"is_extra"?: boolean,"kind": Database["public"]['Enums']["category_kind"],"name": string,"slug": string,"sort"?: number,"visible_to"?: Database["public"]['Enums']["visible_to"]
                  }
                  Update: {
                    "account_general_id"?: string,"account_show_id"?: string | null,"active"?: boolean,"created_at"?: string,"created_by"?: string | null,"emoji"?: string,"id"?: string,"is_extra"?: boolean,"kind"?: Database["public"]['Enums']["category_kind"],"name"?: string,"slug"?: string,"sort"?: number,"visible_to"?: Database["public"]['Enums']["visible_to"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_account_general_id_fkey"
      columns: ["account_general_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_account_general_id_fkey"
      columns: ["account_general_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_account_general_id_fkey"
      columns: ["account_general_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_account_general_id_fkey"
      columns: ["account_general_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_account_show_id_fkey"
      columns: ["account_show_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_account_show_id_fkey"
      columns: ["account_show_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_account_show_id_fkey"
      columns: ["account_show_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_account_show_id_fkey"
      columns: ["account_show_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "categories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "categories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "city": string | null,"created_at": string,"created_by": string | null,"id": string,"kind": Database["public"]['Enums']["contact_kind"],"name": string,"notes": string | null,"phone": string | null,"razon_social": string | null,"rfc": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["contact_kind"],"name": string,"notes"?: string | null,"phone"?: string | null,"razon_social"?: string | null,"rfc"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["contact_kind"],"name"?: string,"notes"?: string | null,"phone"?: string | null,"razon_social"?: string | null,"rfc"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "contacts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"events": {
                  Row: {
                    "captured_at": string,"cfdi_uuid": string | null,"client_id": string,"created_at": string,"created_by": string,"device_info": string | null,"id": string,"journal_entry_id": string | null,"note": string | null,"project_id": string | null,"show_id": string | null,"status": Database["public"]['Enums']["event_status"],"type": Database["public"]['Enums']["event_type"],"void_entry_id": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "captured_at": string,"cfdi_uuid"?: string | null,"client_id": string,"created_at"?: string,"created_by": string,"device_info"?: string | null,"id"?: string,"journal_entry_id"?: string | null,"note"?: string | null,"project_id"?: string | null,"show_id"?: string | null,"status": Database["public"]['Enums']["event_status"],"type": Database["public"]['Enums']["event_type"],"void_entry_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "captured_at"?: string,"cfdi_uuid"?: string | null,"client_id"?: string,"created_at"?: string,"created_by"?: string,"device_info"?: string | null,"id"?: string,"journal_entry_id"?: string | null,"note"?: string | null,"project_id"?: string | null,"show_id"?: string | null,"status"?: Database["public"]['Enums']["event_status"],"type"?: Database["public"]['Enums']["event_type"],"void_entry_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_journal_entry_id_fkey"
      columns: ["journal_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "events_void_entry_id_fkey"
      columns: ["void_entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"expense_details": {
                  Row: {
                    "ai_raw": Json | null,"amount_cents": number,"category_id": string,"description": string | null,"event_id": string,"paid_with": Database["public"]['Enums']["paid_with"],"payee_contact_id": string | null,"payer_member_id": string,"receipt_path": string | null,"settlement_pref": Database["public"]['Enums']["settlement_pref"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_raw"?: Json | null,"amount_cents": number,"category_id": string,"description"?: string | null,"event_id": string,"paid_with": Database["public"]['Enums']["paid_with"],"payee_contact_id"?: string | null,"payer_member_id": string,"receipt_path"?: string | null,"settlement_pref"?: Database["public"]['Enums']["settlement_pref"] | null
                  }
                  Update: {
                    "ai_raw"?: Json | null,"amount_cents"?: number,"category_id"?: string,"description"?: string | null,"event_id"?: string,"paid_with"?: Database["public"]['Enums']["paid_with"],"payee_contact_id"?: string | null,"payer_member_id"?: string,"receipt_path"?: string | null,"settlement_pref"?: Database["public"]['Enums']["settlement_pref"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_details_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_details_payee_contact_id_fkey"
      columns: ["payee_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "expense_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"fund_movements": {
                  Row: {
                    "amount_cents": number,"direction": Database["public"]['Enums']["reclass_direction"] | null,"event_id": string,"holder_member_id": string | null,"kind": Database["public"]['Enums']["fund_kind"],"member_id": string,"place": Database["public"]['Enums']["money_place"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"direction"?: Database["public"]['Enums']["reclass_direction"] | null,"event_id": string,"holder_member_id"?: string | null,"kind": Database["public"]['Enums']["fund_kind"],"member_id": string,"place"?: Database["public"]['Enums']["money_place"] | null
                  }
                  Update: {
                    "amount_cents"?: number,"direction"?: Database["public"]['Enums']["reclass_direction"] | null,"event_id"?: string,"holder_member_id"?: string | null,"kind"?: Database["public"]['Enums']["fund_kind"],"member_id"?: string,"place"?: Database["public"]['Enums']["money_place"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fund_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "fund_movements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"income_details": {
                  Row: {
                    "account_id": string,"amount_cents": number,"category_id": string,"description": string | null,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_cents": number,"category_id": string,"description"?: string | null,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount_cents"?: number,"category_id"?: string,"description"?: string | null,"destination"?: Database["public"]['Enums']["money_place"],"event_id"?: string,"holder_member_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_details_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "income_details_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "income_details_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "income_details_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "income_details_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "income_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "income_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "income_details_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "income_details_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "income_details_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "cost_cents": number,"created_at": string,"event_id": string,"id": string,"kind": Database["public"]['Enums']["inventory_kind"],"location_id": string,"qty": number,"unit_cost_cents": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_cents": number,"created_at"?: string,"event_id": string,"id"?: string,"kind": Database["public"]['Enums']["inventory_kind"],"location_id": string,"qty": number,"unit_cost_cents": number,"variant_id": string
                  }
                  Update: {
                    "cost_cents"?: number,"created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["inventory_kind"],"location_id"?: string,"qty"?: number,"unit_cost_cents"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"journal_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"date": string,"description": string,"id": string,"is_manual": boolean,"number": number,"period_id": string,"reverses_entry_id": string | null,"source_event_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"date": string,"description": string,"id"?: string,"is_manual"?: boolean,"number"?: never,"period_id": string,"reverses_entry_id"?: string | null,"source_event_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"date"?: string,"description"?: string,"id"?: string,"is_manual"?: boolean,"number"?: never,"period_id"?: string,"reverses_entry_id"?: string | null,"source_event_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "journal_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "journal_entries_period_id_fkey"
      columns: ["period_id"]
isOneToOne: false
      referencedRelation: "periods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_reverses_entry_id_fkey"
      columns: ["reverses_entry_id"]
isOneToOne: true
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_source_event_fkey"
      columns: ["source_event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_entries_source_event_fkey"
      columns: ["source_event_id"]
isOneToOne: false
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    }
                  ]
                },"journal_lines": {
                  Row: {
                    "account_id": string,"credit_cents": number,"debit_cents": number,"entry_id": string,"id": string,"member_id": string | null,"memo": string | null,"project_id": string | null,"show_id": string | null,"variant_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"credit_cents"?: number,"debit_cents"?: number,"entry_id": string,"id"?: string,"member_id"?: string | null,"memo"?: string | null,"project_id"?: string | null,"show_id"?: string | null,"variant_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"credit_cents"?: number,"debit_cents"?: number,"entry_id"?: string,"id"?: string,"member_id"?: string | null,"memo"?: string | null,"project_id"?: string | null,"show_id"?: string | null,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "journal_lines_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "journal_lines_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "journal_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "journal_lines_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "journal_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "journal_lines_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "journal_lines_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "journal_lines_variant_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_variant_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string
                  }
                  Update: {
                    "id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"periods": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"created_at": string,"id": string,"month": number,"reopen_reason": string | null,"status": Database["public"]['Enums']["period_status"],"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"month": number,"reopen_reason"?: string | null,"status"?: Database["public"]['Enums']["period_status"],"year": number
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"created_at"?: string,"id"?: string,"month"?: number,"reopen_reason"?: string | null,"status"?: Database["public"]['Enums']["period_status"],"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "periods_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "periods_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "periods_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"places": {
                  Row: {
                    "active": boolean,"address": string,"created_at": string,"created_by": string | null,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "places_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "places_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "places_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "active": boolean,"avg_cost_cents": number,"created_at": string,"id": string,"label": string,"low_stock_threshold": number,"price_cents": number,"product_id": string,"sku": string,"sort": number,"stock_qty": number,"stock_value_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"avg_cost_cents"?: number,"created_at"?: string,"id"?: string,"label": string,"low_stock_threshold"?: number,"price_cents"?: number,"product_id": string,"sku": string,"sort"?: number,"stock_qty"?: number,"stock_value_cents"?: number
                  }
                  Update: {
                    "active"?: boolean,"avg_cost_cents"?: number,"created_at"?: string,"id"?: string,"label"?: string,"low_stock_threshold"?: number,"price_cents"?: number,"product_id"?: string,"sku"?: string,"sort"?: number,"stock_qty"?: number,"stock_value_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["product_id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"category": Database["public"]['Enums']["merch_category"],"created_at": string,"created_by": string | null,"emoji": string,"id": string,"inventory_account_id": string,"name": string,"photo_path": string | null,"revenue_account_id": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category": Database["public"]['Enums']["merch_category"],"created_at"?: string,"created_by"?: string | null,"emoji"?: string,"id"?: string,"inventory_account_id": string,"name": string,"photo_path"?: string | null,"revenue_account_id": string,"sort"?: number
                  }
                  Update: {
                    "active"?: boolean,"category"?: Database["public"]['Enums']["merch_category"],"created_at"?: string,"created_by"?: string | null,"emoji"?: string,"id"?: string,"inventory_account_id"?: string,"name"?: string,"photo_path"?: string | null,"revenue_account_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "products_inventory_account_id_fkey"
      columns: ["inventory_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_inventory_account_id_fkey"
      columns: ["inventory_account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "products_inventory_account_id_fkey"
      columns: ["inventory_account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "products_inventory_account_id_fkey"
      columns: ["inventory_account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "products_revenue_account_id_fkey"
      columns: ["revenue_account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_revenue_account_id_fkey"
      columns: ["revenue_account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "products_revenue_account_id_fkey"
      columns: ["revenue_account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "products_revenue_account_id_fkey"
      columns: ["revenue_account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "activo": boolean,"color": string,"created_at": string,"created_by": string | null,"display_name": string,"emoji": string,"id": string,"participa_reparto": boolean,"role": Database["public"]['Enums']["user_role"],"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name": string,"emoji"?: string,"id": string,"participa_reparto"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"username": string
                  }
                  Update: {
                    "activo"?: boolean,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"emoji"?: string,"id"?: string,"participa_reparto"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "profiles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"project_types": {
                  Row: {
                    "code": string,"emoji": string,"id": string,"is_show": boolean,"name": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"emoji"?: string,"id"?: string,"is_show"?: boolean,"name": string,"sort"?: number
                  }
                  Update: {
                    "code"?: string,"emoji"?: string,"id"?: string,"is_show"?: boolean,"name"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "budget_cents": number | null,"code": string,"created_at": string,"created_by": string | null,"end_date": string | null,"id": string,"name": string,"notes": string | null,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"type_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_cents"?: number | null,"code": string,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"type_id": string
                  }
                  Update: {
                    "budget_cents"?: number | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"type_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "projects_type_id_fkey"
      columns: ["type_id"]
isOneToOne: false
      referencedRelation: "project_types"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_details": {
                  Row: {
                    "description": string | null,"event_id": string,"is_opening": boolean,"paid_with": Database["public"]['Enums']["paid_with"] | null,"payer_member_id": string,"pieces": number,"settlement_pref": Database["public"]['Enums']["settlement_pref"] | null,"supplier_contact_id": string | null,"total_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"event_id": string,"is_opening"?: boolean,"paid_with"?: Database["public"]['Enums']["paid_with"] | null,"payer_member_id": string,"pieces": number,"settlement_pref"?: Database["public"]['Enums']["settlement_pref"] | null,"supplier_contact_id"?: string | null,"total_cents": number
                  }
                  Update: {
                    "description"?: string | null,"event_id"?: string,"is_opening"?: boolean,"paid_with"?: Database["public"]['Enums']["paid_with"] | null,"payer_member_id"?: string,"pieces"?: number,"settlement_pref"?: Database["public"]['Enums']["settlement_pref"] | null,"supplier_contact_id"?: string | null,"total_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "purchase_details_payer_member_id_fkey"
      columns: ["payer_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "purchase_details_supplier_contact_id_fkey"
      columns: ["supplier_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_lines": {
                  Row: {
                    "event_id": string,"id": string,"qty": number,"unit_cost_cents": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"id"?: string,"qty": number,"unit_cost_cents": number,"variant_id": string
                  }
                  Update: {
                    "event_id"?: string,"id"?: string,"qty"?: number,"unit_cost_cents"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_lines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"receivable_collections": {
                  Row: {
                    "account_id": string,"amount_cents": number,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id": string | null,"platform_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_cents": number,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id"?: string | null,"platform_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount_cents"?: number,"destination"?: Database["public"]['Enums']["money_place"],"event_id"?: string,"holder_member_id"?: string | null,"platform_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "receivable_collections_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receivable_collections_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "receivable_collections_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "receivable_collections_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "receivable_collections_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receivable_collections_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receivable_collections_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receivable_collections_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "receivable_collections_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "receivable_collections_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "ticket_platforms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receivable_collections_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["platform_id"]
    }
                  ]
                },"sale_details": {
                  Row: {
                    "channel": Database["public"]['Enums']["sale_channel"],"channel_note": string | null,"collected_by": string,"event_id": string,"payment_method": Database["public"]['Enums']["payment_method"],"pieces": number,"total_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": Database["public"]['Enums']["sale_channel"],"channel_note"?: string | null,"collected_by": string,"event_id": string,"payment_method": Database["public"]['Enums']["payment_method"],"pieces": number,"total_cents": number
                  }
                  Update: {
                    "channel"?: Database["public"]['Enums']["sale_channel"],"channel_note"?: string | null,"collected_by"?: string,"event_id"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"pieces"?: number,"total_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_details_collected_by_fkey"
      columns: ["collected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_details_collected_by_fkey"
      columns: ["collected_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "sale_details_collected_by_fkey"
      columns: ["collected_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "sale_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_details_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_lines": {
                  Row: {
                    "cost_cents": number,"event_id": string,"id": string,"is_gift": boolean,"qty": number,"unit_cost_cents": number,"unit_price_cents": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_cents": number,"event_id": string,"id"?: string,"is_gift"?: boolean,"qty": number,"unit_cost_cents": number,"unit_price_cents": number,"variant_id": string
                  }
                  Update: {
                    "cost_cents"?: number,"event_id"?: string,"id"?: string,"is_gift"?: boolean,"qty"?: number,"unit_cost_cents"?: number,"unit_price_cents"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_lines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"show_advances": {
                  Row: {
                    "amount_cents": number,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id": string | null,"show_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"destination": Database["public"]['Enums']["money_place"],"event_id": string,"holder_member_id"?: string | null,"show_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"destination"?: Database["public"]['Enums']["money_place"],"event_id"?: string,"holder_member_id"?: string | null,"show_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "show_advances_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_advances_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_advances_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_advances_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "show_advances_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "show_advances_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_advances_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "show_advances_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    }
                  ]
                },"show_settlements": {
                  Row: {
                    "advance_applied_cents": number,"commission_cents": number,"deal_type": Database["public"]['Enums']["deal_type"],"destination": Database["public"]['Enums']["money_place"] | null,"event_id": string,"fee_cents": number,"gross_cents": number,"holder_member_id": string | null,"income_cents": number,"net_cents": number,"pending": boolean,"platform_id": string | null,"share_cents": number,"show_id": string,"tickets_sold": number
                  }
                  ComputedFields: never
                  Insert: {
                    "advance_applied_cents"?: number,"commission_cents"?: number,"deal_type": Database["public"]['Enums']["deal_type"],"destination"?: Database["public"]['Enums']["money_place"] | null,"event_id": string,"fee_cents"?: number,"gross_cents"?: number,"holder_member_id"?: string | null,"income_cents": number,"net_cents"?: number,"pending": boolean,"platform_id"?: string | null,"share_cents"?: number,"show_id": string,"tickets_sold"?: number
                  }
                  Update: {
                    "advance_applied_cents"?: number,"commission_cents"?: number,"deal_type"?: Database["public"]['Enums']["deal_type"],"destination"?: Database["public"]['Enums']["money_place"] | null,"event_id"?: string,"fee_cents"?: number,"gross_cents"?: number,"holder_member_id"?: string | null,"income_cents"?: number,"net_cents"?: number,"pending"?: boolean,"platform_id"?: string | null,"share_cents"?: number,"show_id"?: string,"tickets_sold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "show_settlements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_settlements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_settlements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_settlements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "show_settlements_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "show_settlements_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "ticket_platforms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_settlements_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["platform_id"]
    },{
      foreignKeyName: "show_settlements_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "show_settlements_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "show_settlements_show_id_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    }
                  ]
                },"shows": {
                  Row: {
                    "city": string | null,"created_at": string,"created_by": string | null,"date": string,"deal_type": Database["public"]['Enums']["deal_type"],"expected_income_cents": number,"expected_tickets": number,"fee_cents": number,"id": string,"name": string,"notes": string | null,"percentage": number,"platform_id": string | null,"project_id": string,"status": Database["public"]['Enums']["show_status"],"ticket_price_cents": number,"venue_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"date": string,"deal_type": Database["public"]['Enums']["deal_type"],"expected_income_cents"?: number,"expected_tickets"?: number,"fee_cents"?: number,"id"?: string,"name": string,"notes"?: string | null,"percentage"?: number,"platform_id"?: string | null,"project_id": string,"status"?: Database["public"]['Enums']["show_status"],"ticket_price_cents"?: number,"venue_id"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"created_at"?: string,"created_by"?: string | null,"date"?: string,"deal_type"?: Database["public"]['Enums']["deal_type"],"expected_income_cents"?: number,"expected_tickets"?: number,"fee_cents"?: number,"id"?: string,"name"?: string,"notes"?: string | null,"percentage"?: number,"platform_id"?: string | null,"project_id"?: string,"status"?: Database["public"]['Enums']["show_status"],"ticket_price_cents"?: number,"venue_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "shows_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shows_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "shows_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "shows_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "ticket_platforms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shows_platform_id_fkey"
      columns: ["platform_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["platform_id"]
    },{
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "shows_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_adjustments": {
                  Row: {
                    "cost_cents": number,"counted_qty": number | null,"event_id": string,"kind": Database["public"]['Enums']["inventory_kind"],"note": string | null,"qty": number,"variant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_cents": number,"counted_qty"?: number | null,"event_id": string,"kind": Database["public"]['Enums']["inventory_kind"],"note"?: string | null,"qty": number,"variant_id": string
                  }
                  Update: {
                    "cost_cents"?: number,"counted_qty"?: number | null,"event_id"?: string,"kind"?: Database["public"]['Enums']["inventory_kind"],"note"?: string | null,"qty"?: number,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_adjustments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_adjustments_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"supplier_payments": {
                  Row: {
                    "amount_cents": number,"contact_id": string | null,"description": string | null,"event_id": string,"holder_member_id": string | null,"origin": Database["public"]['Enums']["money_place"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"contact_id"?: string | null,"description"?: string | null,"event_id": string,"holder_member_id"?: string | null,"origin": Database["public"]['Enums']["money_place"]
                  }
                  Update: {
                    "amount_cents"?: number,"contact_id"?: string | null,"description"?: string | null,"event_id"?: string,"holder_member_id"?: string | null,"origin"?: Database["public"]['Enums']["money_place"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_payments_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "supplier_payments_holder_member_id_fkey"
      columns: ["holder_member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"ticket_platforms": {
                  Row: {
                    "account_id": string,"active": boolean,"bearer": Database["public"]['Enums']["commission_bearer"],"commission_fixed_cents": number,"commission_pct": number,"contact_id": string | null,"created_at": string,"id": string,"name": string,"settlement_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"active"?: boolean,"bearer"?: Database["public"]['Enums']["commission_bearer"],"commission_fixed_cents"?: number,"commission_pct"?: number,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"settlement_days"?: number
                  }
                  Update: {
                    "account_id"?: string,"active"?: boolean,"bearer"?: Database["public"]['Enums']["commission_bearer"],"commission_fixed_cents"?: number,"commission_pct"?: number,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"settlement_days"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_platforms_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_platforms_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_balances"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "ticket_platforms_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_receivables"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "ticket_platforms_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_trial_balance"
      referencedColumns: ["account_id"]
    },{
      foreignKeyName: "ticket_platforms_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"transport_payments": {
                  Row: {
                    "amount_cents": number,"event_id": string,"from_member": string,"to_member": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"event_id": string,"from_member": string,"to_member": string
                  }
                  Update: {
                    "amount_cents"?: number,"event_id"?: string,"from_member"?: string,"to_member"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transport_payments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"trip_cars": {
                  Row: {
                    "event_id": string,"fuel": Database["public"]['Enums']["fuel_type"],"fuel_cents": number,"id": string,"km_per_liter": number,"owner_id": string,"price_per_liter_cents": number,"riders": (string)[],"toll_cents": number,"toll_paid_by": string | null,"vehicle_id": string,"wear_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"fuel": Database["public"]['Enums']["fuel_type"],"fuel_cents": number,"id"?: string,"km_per_liter": number,"owner_id": string,"price_per_liter_cents": number,"riders"?: (string)[],"toll_cents"?: number,"toll_paid_by"?: string | null,"vehicle_id": string,"wear_cents": number
                  }
                  Update: {
                    "event_id"?: string,"fuel"?: Database["public"]['Enums']["fuel_type"],"fuel_cents"?: number,"id"?: string,"km_per_liter"?: number,"owner_id"?: string,"price_per_liter_cents"?: number,"riders"?: (string)[],"toll_cents"?: number,"toll_paid_by"?: string | null,"vehicle_id"?: string,"wear_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_cars_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "trip_cars_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_trips"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "trip_cars_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_cars_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "trip_cars_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "trip_cars_toll_paid_by_fkey"
      columns: ["toll_paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_cars_toll_paid_by_fkey"
      columns: ["toll_paid_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "trip_cars_toll_paid_by_fkey"
      columns: ["toll_paid_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "trip_cars_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "dest_address": string | null,"dest_name": string,"distance_m": number,"duration_s": number | null,"event_id": string,"note": string | null,"origin_address": string | null,"origin_name": string,"purpose": Database["public"]['Enums']["trip_purpose"],"round_trip": boolean,"sharers": (string)[],"total_cents": number,"traffic_pct": number,"wear_cents_per_km": number
                  }
                  ComputedFields: never
                  Insert: {
                    "dest_address"?: string | null,"dest_name": string,"distance_m": number,"duration_s"?: number | null,"event_id": string,"note"?: string | null,"origin_address"?: string | null,"origin_name": string,"purpose": Database["public"]['Enums']["trip_purpose"],"round_trip"?: boolean,"sharers": (string)[],"total_cents": number,"traffic_pct"?: number,"wear_cents_per_km": number
                  }
                  Update: {
                    "dest_address"?: string | null,"dest_name"?: string,"distance_m"?: number,"duration_s"?: number | null,"event_id"?: string,"note"?: string | null,"origin_address"?: string | null,"origin_name"?: string,"purpose"?: Database["public"]['Enums']["trip_purpose"],"round_trip"?: boolean,"sharers"?: (string)[],"total_cents"?: number,"traffic_pct"?: number,"wear_cents_per_km"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"fuel": Database["public"]['Enums']["fuel_type"],"id": string,"km_per_liter": number,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"fuel": Database["public"]['Enums']["fuel_type"],"id"?: string,"km_per_liter": number,"name": string,"owner_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"fuel"?: Database["public"]['Enums']["fuel_type"],"id"?: string,"km_per_liter"?: number,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "vehicles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "vehicles_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "vehicles_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                }
          }
          Views: {
            "v_account_balances": {
                  Row: {
                    "account_id": string,"code": string,"credit_cents": number | null,"debit_cents": number | null,"month": number,"name": string,"year": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_alerts": {
                  Row: {
                    "amount": number | null,"kind": string | null,"ref": string | null,"since": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_cash_position": {
                  Row: {
                    "balance_cents": number | null,"kind": string | null,"member_id": string | null,"name": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"v_event_feed": {
                  Row: {
                    "amount_cents": number | null,"captured_at": string,"category_emoji": string | null,"category_name": string | null,"client_id": string,"created_at": string,"created_by": string,"description": string | null,"direction": Database["public"]['Enums']["reclass_direction"] | null,"from_kind": Database["public"]['Enums']["transfer_party"] | null,"from_member": string | null,"fund_kind": Database["public"]['Enums']["fund_kind"] | null,"fund_member": string | null,"id": string,"note": string | null,"paid_with": Database["public"]['Enums']["paid_with"] | null,"pay_from": string | null,"pay_to": string | null,"pieces": number | null,"place": Database["public"]['Enums']["money_place"] | null,"project_id": string | null,"settlement_pref": Database["public"]['Enums']["settlement_pref"] | null,"show_id": string | null,"show_name": string | null,"show_pending": boolean | null,"status": Database["public"]['Enums']["event_status"],"stock_kind": Database["public"]['Enums']["inventory_kind"] | null,"to_kind": Database["public"]['Enums']["transfer_party"] | null,"to_member": string | null,"trip_dest": string | null,"trip_origin": string | null,"trip_purpose": Database["public"]['Enums']["trip_purpose"] | null,"type": Database["public"]['Enums']["event_type"],"void_reason": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "cash_transfers_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["fund_member"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["fund_member"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "fund_movements_member_id_fkey"
      columns: ["fund_member"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["pay_from"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["pay_from"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_from_member_fkey"
      columns: ["pay_from"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["pay_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["pay_to"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "transport_payments_to_member_fkey"
      columns: ["pay_to"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"v_inventory": {
                  Row: {
                    "active": boolean | null,"avg_cost_cents": number,"category": Database["public"]['Enums']["merch_category"],"emoji": string,"label": string,"low_stock_threshold": number,"photo_path": string | null,"price_cents": number,"product_id": string,"product_name": string,"product_sort": number,"sku": string,"stock_qty": number,"stock_status": string | null,"stock_value_cents": number,"variant_id": string,"variant_sort": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_kardex": {
                  Row: {
                    "captured_at": string,"cost_cents": number,"created_at": string,"created_by": string,"event_id": string,"event_status": Database["public"]['Enums']["event_status"],"event_type": Database["public"]['Enums']["event_type"],"is_opening": boolean | null,"kind": Database["public"]['Enums']["inventory_kind"],"movement_id": string,"qty": number,"unit_cost_cents": number,"variant_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "inventory_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "v_inventory"
      referencedColumns: ["variant_id"]
    }
                  ]
                },"v_member_balances": {
                  Row: {
                    "activo": boolean,"cash_cents": number | null,"contributions_cents": number | null,"display_name": string,"distributions_cents": number | null,"distributions_payable_cents": number | null,"emoji": string,"member_id": string,"owed_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_merch_daily": {
                  Row: {
                    "cost_cents": number | null,"day": string | null,"gift_pieces": number | null,"pieces": number | null,"project_id": string | null,"revenue_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    }
                  ]
                },"v_project_pnl": {
                  Row: {
                    "code": string,"costs_cents": number | null,"merch_cost_cents": number | null,"merch_revenue_cents": number | null,"name": string,"net_cents": number | null,"other_income_cents": number | null,"project_id": string,"show_income_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_receivables": {
                  Row: {
                    "account_id": string,"balance_cents": number | null,"code": string,"name": string,"platform_id": string | null,"settlement_days": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_results_by_period": {
                  Row: {
                    "expense_cents": number | null,"income_cents": number | null,"month": number,"year": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_results_by_project": {
                  Row: {
                    "expense_cents": number | null,"income_cents": number | null,"project_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "journal_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "journal_lines_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    }
                  ]
                },"v_show_pnl": {
                  Row: {
                    "costs_cents": number | null,"date": string,"deal_type": Database["public"]['Enums']["deal_type"],"expected_income_cents": number,"merch_cost_cents": number | null,"merch_revenue_cents": number | null,"name": string,"net_cents": number | null,"other_income_cents": number | null,"project_id": string,"show_id": string,"show_income_cents": number | null,"status": Database["public"]['Enums']["show_status"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    }
                  ]
                },"v_show_report": {
                  Row: {
                    "city": string | null,"commission_cents": number | null,"costs_cents": number | null,"date": string,"deal_type": Database["public"]['Enums']["deal_type"],"expected_income_cents": number,"expected_tickets": number,"fee_cents": number,"gross_cents": number | null,"income_cents": number | null,"merch_cost_cents": number | null,"merch_revenue_cents": number | null,"name": string,"net_cents": number | null,"other_income_cents": number | null,"pending": boolean | null,"percentage": number,"project_id": string,"show_id": string,"show_income_cents": number | null,"status": Database["public"]['Enums']["show_status"],"ticket_price_cents": number,"tickets_sold": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shows_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    }
                  ]
                },"v_transport_balances": {
                  Row: {
                    "activo": boolean,"balance_cents": number | null,"display_name": string,"emoji": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "activo"?: boolean | null,"balance_cents"?: never,"display_name"?: string | null,"emoji"?: string | null,"member_id"?: string | null
                         }
                        Update: {
                           "activo"?: boolean | null,"balance_cents"?: never,"display_name"?: string | null,"emoji"?: string | null,"member_id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_trial_balance": {
                  Row: {
                    "account_id": string,"balance_cents": number | null,"code": string,"credit_cents": number | null,"debit_cents": number | null,"member_id": string | null,"name": string,"nature": Database["public"]['Enums']["account_nature"],"type": Database["public"]['Enums']["account_type"]
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "accounts_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"v_trips": {
                  Row: {
                    "captured_at": string,"cars": Json | null,"created_by": string,"dest_address": string | null,"dest_name": string,"distance_m": number,"duration_s": number | null,"event_id": string,"note": string | null,"origin_address": string | null,"origin_name": string,"project_id": string | null,"purpose": Database["public"]['Enums']["trip_purpose"],"round_trip": boolean,"sharers": (string)[],"show_id": string | null,"status": Database["public"]['Enums']["event_status"],"total_cents": number,"traffic_pct": number,"wear_cents_per_km": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "v_transport_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "v_project_pnl"
      referencedColumns: ["project_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "shows"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_pnl"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "events_show_fkey"
      columns: ["show_id"]
isOneToOne: false
      referencedRelation: "v_show_report"
      referencedColumns: ["show_id"]
    },{
      foreignKeyName: "trips_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "v_event_feed"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "account_balance":
{ Args: { "p_account": string }; Returns: number
                           },
"account_id":
{ Args: { "p_code": string }; Returns: string
                           },
"apply_stock":
{ Args: { "p_event": string,"p_kind": Database["public"]['Enums']["inventory_kind"],"p_qty": number,"p_unit_cost": number,"p_variant": string }; Returns: number
                           },
"confirm_cash_transfer":
{ Args: { "p_accept": boolean,"p_event_id": string }; Returns: Json
                           },
"create_project":
{ Args: { "p_budget_cents"?: number,"p_end"?: string,"p_name": string,"p_notes"?: string,"p_start"?: string,"p_type_code": string }; Returns: {
              "budget_cents": number | null,
"code": string,
"created_at": string,
"created_by": string | null,
"end_date": string | null,
"id": string,
"name": string,
"notes": string | null,
"start_date": string | null,
"status": Database["public"]['Enums']["project_status"],
"type_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"ensure_member_accounts":
{ Args: { "p_member": string }; Returns: undefined
                           },
"event_result":
{ Args: { "p_duplicate"?: boolean,"p_event": string }; Returns: Json
                           },
"expected_show_income":
{ Args: { "p_deal": Database["public"]['Enums']["deal_type"],"p_fee": number,"p_pct": number,"p_platform": string,"p_price": number,"p_tickets": number }; Returns: number
                           },
"insert_merch_detail":
{ Args: { "p_contador": boolean,"p_event": string,"p_payload": Json,"p_type": Database["public"]['Enums']["event_type"],"p_uid": string }; Returns: undefined
                           },
"insert_show_detail":
{ Args: { "p_amount": number,"p_contador": boolean,"p_event": string,"p_payload": Json,"p_type": Database["public"]['Enums']["event_type"],"p_uid": string }; Returns: undefined
                           },
"insert_transport_detail":
{ Args: { "p_amount": number,"p_contador": boolean,"p_event": string,"p_payload": Json,"p_type": Database["public"]['Enums']["event_type"],"p_uid": string }; Returns: undefined
                           },
"is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_contador":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"jl":
{ Args: { "p_account": string,"p_credit": number,"p_debit": number,"p_member"?: string,"p_project"?: string }; Returns: Json
                           },
"jlv":
{ Args: { "p_account": string,"p_credit": number,"p_debit": number,"p_member": string,"p_project": string,"p_variant": string }; Returns: Json
                           },
"log_audit":
{ Args: { "p_action": string,"p_device"?: string,"p_entity": string,"p_entity_id"?: string,"p_payload"?: Json }; Returns: string
                           },
"member_account":
{ Args: { "p_kind": Database["public"]['Enums']["member_account_kind"],"p_member": string }; Returns: string
                           },
"party_account":
{ Args: { "p_kind": Database["public"]['Enums']["transfer_party"],"p_member": string }; Returns: string
                           },
"place_account":
{ Args: { "p_member": string,"p_place": Database["public"]['Enums']["money_place"] }; Returns: string
                           },
"post_ajuste_stock":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_anticipo_show":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_cierre_show":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_cobro_pendiente":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_compra":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_entrega":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_entry":
{ Args: { "p_date": string,"p_description": string,"p_event": string,"p_lines": Json,"p_manual"?: boolean,"p_period": string,"p_reverses"?: string }; Returns: string
                           },
"post_event":
{ Args: { "p_event": string }; Returns: string
                           },
"post_fondo":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_gasto":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_ingreso":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_pago_proveedor":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_pago_transporte":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_venta":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"post_viaje":
{ Args: { "e": Omit<Database["public"]['Tables']["events"]['Row'], Database["public"]['Tables']["events"]['ComputedFields']>,"p_date": string,"p_period": string }; Returns: string
                           },
"report_account_totals":
{ Args: { "p_from"?: string,"p_project"?: string,"p_show"?: string,"p_to"?: string }; Returns: {
              "account_id": string,"code": string,"credit_cents": number,"debit_cents": number,"member_id": string,"name": string,"nature": Database["public"]['Enums']["account_nature"],"type": Database["public"]['Enums']["account_type"]
            }[]
                           },
"report_cash_flow":
{ Args: { "p_from"?: string,"p_project"?: string,"p_to"?: string }; Returns: {
              "detail": string,"inflow_cents": number,"kind": string,"net_cents": number,"outflow_cents": number
            }[]
                           },
"report_ledger":
{ Args: { "p_account": string,"p_from"?: string,"p_to"?: string }; Returns: {
              "credit_cents": number,"date": string,"debit_cents": number,"description": string,"entry_number": number,"line_id": string
            }[]
                           },
"report_merch":
{ Args: { "p_from"?: string,"p_to"?: string }; Returns: {
              "avg_cost_cents": number,"category": Database["public"]['Enums']["merch_category"],"cost_cents": number,"gift_cost_cents": number,"gift_qty": number,"label": string,"price_cents": number,"product_name": string,"revenue_cents": number,"sold_qty": number,"stock_qty": number,"stock_value_cents": number,"variant_id": string
            }[]
                           },
"resolve_accounting_date":
{ Args: { "p_date": string }; Returns: Record<string, unknown>
                           },
"revert_stock":
{ Args: { "p_event": string }; Returns: undefined
                           },
"save_place":
{ Args: { "p_active"?: boolean,"p_address": string,"p_id": string,"p_name": string }; Returns: {
              "active": boolean,
"address": string,
"created_at": string,
"created_by": string | null,
"id": string,
"name": string
            }
                          SetofOptions: {
        from: "*"
        to: "places"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_product":
{ Args: { "p_payload": Json }; Returns: string
                           },
"save_show":
{ Args: { "p_payload": Json }; Returns: string
                           },
"save_ticket_platform":
{ Args: { "p_payload": Json }; Returns: string
                           },
"save_vehicle":
{ Args: { "p_active"?: boolean,"p_fuel": Database["public"]['Enums']["fuel_type"],"p_id": string,"p_km_per_liter": number,"p_name": string,"p_owner": string }; Returns: {
              "active": boolean,
"created_at": string,
"created_by": string | null,
"fuel": Database["public"]['Enums']["fuel_type"],
"id": string,
"km_per_liter": number,
"name": string,
"owner_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "vehicles"
        isOneToOne: true
        isSetofReturn: false
      } },
"seed_account":
{ Args: { "p_code": string,"p_name": string,"p_nature": Database["public"]['Enums']["account_nature"],"p_postable"?: boolean,"p_type": Database["public"]['Enums']["account_type"] }; Returns: string
                           },
"set_active_context":
{ Args: { "p_project_id": string,"p_show_id"?: string }; Returns: undefined
                           },
"set_product_photo":
{ Args: { "p_path": string,"p_product_id": string }; Returns: undefined
                           },
"set_show_cancelled":
{ Args: { "p_cancelled": boolean,"p_show_id": string }; Returns: undefined
                           },
"set_transport_rates":
{ Args: { "p_diesel_cents": number,"p_magna_cents": number,"p_premium_cents": number,"p_wear_cents_per_km": number }; Returns: {
              "active_project_id": string | null,
"active_show_id": string | null,
"cash_alert_days": number,
"cash_alert_threshold_cents": number,
"fuel_diesel_cents": number,
"fuel_magna_cents": number,
"fuel_premium_cents": number,
"id": boolean,
"timezone": string,
"updated_at": string,
"updated_by": string | null,
"void_window_hours": number,
"wear_cents_per_km": number
            }
                          SetofOptions: {
        from: "*"
        to: "app_settings"
        isOneToOne: true
        isSetofReturn: false
      } },
"submit_event":
{ Args: { "p_captured_at": string,"p_client_id": string,"p_payload": Json,"p_type": Database["public"]['Enums']["event_type"] }; Returns: Json
                           },
"transport_account":
{ Args: { "p_member": string }; Returns: string
                           },
"uuid_v7":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"void_event":
{ Args: { "p_event_id": string,"p_reason": string }; Returns: Json
                           }
          }
          Enums: {
            "account_nature": "deudora"|"acreedora","account_type": "activo"|"pasivo"|"patrimonio"|"ingreso"|"costo"|"gasto"|"otro","category_kind": "gasto"|"ingreso","commission_bearer": "publico"|"banda","contact_kind": "venue"|"proveedor"|"tercero"|"boletera"|"otro","deal_type": "fee_fijo"|"porcentaje_taquilla"|"fee_mas_porcentaje"|"boletaje_propio"|"sin_pago","event_status": "registrado"|"pendiente_confirmacion"|"rechazado"|"anulado","event_type": "gasto"|"ingreso"|"entrega_efectivo"|"puse_dinero"|"reclasificacion"|"regreso_dinero"|"pago_proveedor"|"venta_merch"|"compra_merch"|"salida_merch"|"ajuste_inventario"|"cierre_show"|"anticipo_show"|"cobro_pendiente"|"viaje"|"pago_transporte","fuel_type": "magna"|"premium"|"diesel","fund_kind": "prestamo"|"aportacion"|"reclasificacion"|"regreso","inventory_kind": "compra"|"venta"|"regalo"|"merma"|"ajuste"|"anulacion","member_account_kind": "efectivo"|"por_regresar"|"reparto_por_pagar"|"aportaciones"|"repartos"|"transporte","merch_category": "playeras"|"vinilos_cd"|"stickers"|"pines"|"canas"|"otros","money_place": "efectivo_integrante"|"caja"|"cuenta_banda","paid_with": "efectivo_banda"|"caja"|"cuenta_banda"|"mi_dinero"|"pendiente","payment_method": "efectivo"|"transferencia","period_status": "abierto"|"cerrado","project_status": "planeado"|"activo"|"cerrado","reclass_direction": "a_aportacion"|"a_prestamo","sale_channel": "show"|"bandcamp"|"tienda_web"|"otro","settlement_pref": "reembolso"|"compensar_reparto"|"aportacion","show_status": "programado"|"realizado"|"cerrado"|"cancelado","transfer_party": "integrante"|"caja"|"banco","trip_purpose": "ensayo"|"show"|"otro","user_role": "integrante"|"contador","visible_to": "todos"|"contador"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_nature": ["deudora", "acreedora"],"account_type": ["activo", "pasivo", "patrimonio", "ingreso", "costo", "gasto", "otro"],"category_kind": ["gasto", "ingreso"],"commission_bearer": ["publico", "banda"],"contact_kind": ["venue", "proveedor", "tercero", "boletera", "otro"],"deal_type": ["fee_fijo", "porcentaje_taquilla", "fee_mas_porcentaje", "boletaje_propio", "sin_pago"],"event_status": ["registrado", "pendiente_confirmacion", "rechazado", "anulado"],"event_type": ["gasto", "ingreso", "entrega_efectivo", "puse_dinero", "reclasificacion", "regreso_dinero", "pago_proveedor", "venta_merch", "compra_merch", "salida_merch", "ajuste_inventario", "cierre_show", "anticipo_show", "cobro_pendiente", "viaje", "pago_transporte"],"fuel_type": ["magna", "premium", "diesel"],"fund_kind": ["prestamo", "aportacion", "reclasificacion", "regreso"],"inventory_kind": ["compra", "venta", "regalo", "merma", "ajuste", "anulacion"],"member_account_kind": ["efectivo", "por_regresar", "reparto_por_pagar", "aportaciones", "repartos", "transporte"],"merch_category": ["playeras", "vinilos_cd", "stickers", "pines", "canas", "otros"],"money_place": ["efectivo_integrante", "caja", "cuenta_banda"],"paid_with": ["efectivo_banda", "caja", "cuenta_banda", "mi_dinero", "pendiente"],"payment_method": ["efectivo", "transferencia"],"period_status": ["abierto", "cerrado"],"project_status": ["planeado", "activo", "cerrado"],"reclass_direction": ["a_aportacion", "a_prestamo"],"sale_channel": ["show", "bandcamp", "tienda_web", "otro"],"settlement_pref": ["reembolso", "compensar_reparto", "aportacion"],"show_status": ["programado", "realizado", "cerrado", "cancelado"],"transfer_party": ["integrante", "caja", "banco"],"trip_purpose": ["ensayo", "show", "otro"],"user_role": ["integrante", "contador"],"visible_to": ["todos", "contador"]
          }
        }
} as const
