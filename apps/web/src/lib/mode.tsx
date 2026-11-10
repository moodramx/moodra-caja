import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth'

// "Modo banda" (vista de integrante) vs "Modo contador". Solo el contador
// puede alternar; es una preferencia del dispositivo.
const MODE_KEY = 'moodra-caja-modo-contador'

interface ModeState {
  /** true solo si el usuario es contador Y tiene el modo encendido. */
  contadorMode: boolean
  canUseContadorMode: boolean
  setContadorMode: (on: boolean) => void
}

const ModeContext = createContext<ModeState | null>(null)

export function ModeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [enabled, setEnabled] = useState(() => localStorage.getItem(MODE_KEY) === '1')
  const canUseContadorMode = profile?.role === 'contador'

  const setContadorMode = useCallback((on: boolean) => {
    localStorage.setItem(MODE_KEY, on ? '1' : '0')
    setEnabled(on)
  }, [])

  const value = useMemo(
    () => ({ contadorMode: canUseContadorMode && enabled, canUseContadorMode, setContadorMode }),
    [canUseContadorMode, enabled, setContadorMode],
  )

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode(): ModeState {
  const state = useContext(ModeContext)
  if (!state) throw new Error('useMode debe usarse dentro de <ModeProvider>')
  return state
}
