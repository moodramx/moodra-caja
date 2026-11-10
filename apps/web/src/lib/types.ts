// Alias legibles sobre los tipos generados (database.types.ts no se edita a mano).
import type { Database } from './database.types'

export type Profile = Database['public']['Tables']['profiles']['Row']
export type UserRole = Database['public']['Enums']['user_role']
