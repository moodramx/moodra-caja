import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from '@tanstack/react-router'
import { Button } from '../../design/Button'
import { useAuth } from '../../lib/auth'
import { isSupabaseConfigured } from '../../lib/supabase'
import { InstallButton } from '../pwa/InstallGuide'

const inputClass =
  'min-h-14 w-full rounded-control border border-line bg-surface px-4 text-ink placeholder:text-ink-faint'

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/" />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await signIn(username, password)
    setBusy(false)
    if (result.error) setError(result.error)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-10 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[0.3em]">MOODRA $$</h1>
        <p className="mt-2 text-ink-muted">La lana de la banda, al día.</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Usuario</span>
          <input
            className={inputClass}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Contraseña</span>
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {!isSupabaseConfigured && (
          <p role="alert" className="text-pending">
            Falta configurar la conexión (archivo .env.local).
          </p>
        )}

        <Button type="submit" size="lg" block disabled={busy || !username || !password}>
          {busy ? 'Afinando…' : 'Entrar'}
        </Button>
      </form>

      <div className="space-y-3">
        <InstallButton block />
        <p className="text-center text-sm text-ink-muted">
          ¿No tienes usuario o se te olvidó la contraseña? Pídesela a Diego.
        </p>
      </div>
    </main>
  )
}
