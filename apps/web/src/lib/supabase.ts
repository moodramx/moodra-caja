import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** false si faltan las variables de entorno (la app carga, pero no puede entrar). */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(
  url || 'http://127.0.0.1:54321',
  anonKey || 'sin-configurar',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'moodra-caja-auth',
    },
  },
)
