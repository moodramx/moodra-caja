
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
            "app_settings": {
                  Row: {
                    "active_project_id": string | null,"active_show_id": string | null,"cash_alert_days": number,"cash_alert_threshold_cents": number,"id": boolean,"timezone": string,"updated_at": string,"updated_by": string | null,"void_window_hours": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active_project_id"?: string | null,"active_show_id"?: string | null,"cash_alert_days"?: number,"cash_alert_threshold_cents"?: number,"id"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"void_window_hours"?: number
                  }
                  Update: {
                    "active_project_id"?: string | null,"active_show_id"?: string | null,"cash_alert_days"?: number,"cash_alert_threshold_cents"?: number,"id"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"void_window_hours"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
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
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_active_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_contador":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_audit":
{ Args: { "p_action": string,"p_device"?: string,"p_entity": string,"p_entity_id"?: string,"p_payload"?: Json }; Returns: string
                           },
"uuid_v7":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            "user_role": "integrante"|"contador"
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
            "user_role": ["integrante", "contador"]
          }
        }
} as const
