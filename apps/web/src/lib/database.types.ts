// PROVISIONAL: escrito a mano a partir de la migración 20261109000000_cimientos.sql.
// Se reemplaza con `pnpm db:types` (supabase gen types) en cuanto corra Supabase local.
export type UserRole = 'integrante' | 'contador'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string
          color: string
          emoji: string
          role: UserRole
          participa_reparto: boolean
          activo: boolean
          created_at: string
          created_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      app_settings: {
        Row: {
          id: boolean
          active_project_id: string | null
          active_show_id: string | null
          void_window_hours: number
          cash_alert_threshold_cents: number
          cash_alert_days: number
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor: string | null
          action: string
          entity: string
          entity_id: string | null
          payload: Json
          device: string | null
          at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_contador: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_active_member: { Args: Record<PropertyKey, never>; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id?: string
          p_payload?: Json
          p_device?: string
        }
        Returns: string
      }
    }
    Enums: { user_role: UserRole }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
