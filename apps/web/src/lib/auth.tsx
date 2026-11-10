import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'
import { usernameToEmail } from './username'

const PROFILE_CACHE_KEY = 'moodra-caja-profile'

interface AuthState {
  /** true mientras se lee la sesión guardada (solo al arrancar). */
  loading: boolean
  session: Session | null
  profile: Profile | null
  signIn: (username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function readCachedProfile(userId: string | undefined): Profile | null {
  if (!userId) return null
  try {
    const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? 'null') as Profile | null
    return cached?.id === userId ? cached : null
  } catch {
    return null
  }
}

function humanAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Usuario o contraseña incorrectos.'
  if (/banned/i.test(message)) return 'Tu usuario está desactivado. Háblale a Diego.'
  if (/fetch|network/i.test(message))
    return 'No hay conexión. Para entrar por primera vez necesitas internet.'
  return 'No pudimos entrar. Intenta de nuevo.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      // Perfil guardado primero: la app abre sin red.
      setProfile(readCachedProfile(next?.user.id))
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return // sin red: nos quedamos con el perfil guardado
        if (!data || !data.activo) {
          void supabase.auth.signOut()
          return
        }
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data))
        setProfile(data)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn = useCallback(async (username: string, password: string) => {
    let email: string
    try {
      email = usernameToEmail(username)
    } catch {
      return { error: 'Usuario o contraseña incorrectos.' }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? humanAuthError(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    localStorage.removeItem(PROFILE_CACHE_KEY)
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ loading, session, profile, signIn, signOut }),
    [loading, session, profile, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return state
}
