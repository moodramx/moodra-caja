import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { tokens } from './tokens'

export interface ToastOptions {
  message: string
  /** Texto del botón de acción, p. ej. "Deshacer". */
  actionLabel?: string
  onAction?: () => void
  /** ms. Default: 4 s, o 10 s si lleva acción. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastApi {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      const duration = options.duration ?? (options.actionLabel ? tokens.undoWindowMs : 4_000)
      // Máximo 2 visibles: el más viejo se va.
      setItems((current) => [...current.slice(-1), { ...options, id }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-label="Avisos"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex min-h-14 animate-fade-in items-center justify-between gap-3 rounded-control border border-line bg-surface-2 py-1 pr-1 pl-4 shadow-lg shadow-black/40"
          >
            <span className="py-2">{item.message}</span>
            {item.actionLabel && (
              <button
                type="button"
                className="min-h-12 shrink-0 rounded-control px-4 font-semibold text-accent underline underline-offset-4 active:bg-line"
                onClick={() => {
                  item.onAction?.()
                  dismiss(item.id)
                }}
              >
                {item.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return api
}
