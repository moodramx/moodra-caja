import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { AppShell } from '../design/AppShell'
import { useAuth } from '../lib/auth'
import { ModeProvider } from '../lib/mode'
import { startSync } from '../lib/offline/runtime'
import { useRealtimeRefresh } from '../lib/queries'

// Layout de la app con sesión: todo lo que cuelga de aquí requiere estar dentro.
export const Route = createFileRoute('/_app')({ component: AppLayout })

function AppLayout() {
  const { loading, session } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user.id

  // Sync del outbox y refresco en vivo mientras haya sesión.
  useEffect(() => (userId ? startSync(userId, queryClient) : undefined), [userId, queryClient])
  useRealtimeRefresh(Boolean(userId))

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center text-ink-muted" aria-busy="true">
        Afinando…
      </main>
    )
  }
  if (!session) return <Navigate to="/login" />

  return (
    <ModeProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ModeProvider>
  )
}
