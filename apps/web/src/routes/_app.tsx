import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { AppShell } from '../design/AppShell'
import { useAuth } from '../lib/auth'
import { ModeProvider } from '../lib/mode'

// Layout de la app con sesión: todo lo que cuelga de aquí requiere estar dentro.
export const Route = createFileRoute('/_app')({ component: AppLayout })

function AppLayout() {
  const { loading, session } = useAuth()

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
