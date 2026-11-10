import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import type { Profile, UserRole } from '../../lib/types'
import { isValidUsername, normalizeUsername } from '../../lib/username'

const inputClass =
  'min-h-14 w-full rounded-control border border-line bg-surface-2 px-4 text-ink placeholder:text-ink-faint'

type AdminAction =
  | {
      action: 'create'
      username: string
      password: string
      display_name: string
      role: UserRole
      participa_reparto: boolean
      emoji: string
    }
  | { action: 'set_active'; user_id: string; activo: boolean }
  | { action: 'reset_password'; user_id: string; password: string }

async function callAdminUsers(body: AdminAction): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) return
  if (error instanceof FunctionsHttpError) {
    const detail = (await error.context.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? 'No se pudo completar.')
  }
  throw new Error('No hay conexión. Para administrar usuarios necesitas internet.')
}

function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
}

function NewUserSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [emoji, setEmoji] = useState('🎸')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('integrante')
  const [participa, setParticipa] = useState(true)

  const create = useMutation({
    mutationFn: () =>
      callAdminUsers({
        action: 'create',
        username: normalizeUsername(username),
        password,
        display_name: displayName.trim(),
        role,
        participa_reparto: participa,
        emoji: emoji.trim() || '🎵',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast({ message: `Listo: ${displayName.trim()} ya puede entrar.` })
      setUsername('')
      setDisplayName('')
      setPassword('')
      setRole('integrante')
      setParticipa(true)
      onOpenChange(false)
    },
  })

  const valid = isValidUsername(username) && displayName.trim().length > 0 && password.length >= 8

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) create.mutate()
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Nuevo usuario">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Nombre</span>
          <input
            className={inputClass}
            value={displayName}
            maxLength={40}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <label className="block space-y-2">
            <span className="text-sm text-ink-muted">Usuario (para entrar)</span>
            <input
              className={inputClass}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-ink-muted">Emoji</span>
            <input
              className={`${inputClass} text-center`}
              value={emoji}
              maxLength={8}
              onChange={(event) => setEmoji(event.target.value)}
            />
          </label>
        </div>
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Contraseña inicial (mínimo 8)</span>
          <input
            className={inputClass}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Chip selected={role === 'integrante'} onClick={() => setRole('integrante')}>
            Integrante
          </Chip>
          <Chip selected={role === 'contador'} onClick={() => setRole('contador')}>
            Contador
          </Chip>
          <Chip selected={participa} onClick={() => setParticipa((value) => !value)}>
            Participa en repartos
          </Chip>
        </div>

        {create.error && (
          <p role="alert" className="text-danger">
            {create.error.message}
          </p>
        )}

        <Button type="submit" size="lg" block disabled={!valid || create.isPending}>
          {create.isPending ? 'Creando…' : 'Crear usuario'}
        </Button>
      </form>
    </BottomSheet>
  )
}

function UserSheet({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { profile: me } = useAuth()
  const [password, setPassword] = useState('')

  const run = useMutation({
    mutationFn: callAdminUsers,
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast({
        message: variables.action === 'reset_password' ? 'Contraseña cambiada.' : 'Listo.',
      })
      setPassword('')
      onClose()
    },
  })

  return (
    <BottomSheet
      open={user !== null}
      onOpenChange={(open) => !open && onClose()}
      title={user ? `${user.emoji} ${user.display_name}` : ''}
      description={user ? `@${user.username}` : undefined}
    >
      {user && (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-ink-muted">Nueva contraseña (mínimo 8)</span>
            <input
              className={inputClass}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Button
            block
            disabled={password.length < 8 || run.isPending}
            onClick={() => run.mutate({ action: 'reset_password', user_id: user.id, password })}
          >
            Cambiar contraseña
          </Button>
          {user.id !== me?.id && (
            <Button
              variant={user.activo ? 'danger' : 'secondary'}
              block
              disabled={run.isPending}
              onClick={() =>
                run.mutate({ action: 'set_active', user_id: user.id, activo: !user.activo })
              }
            >
              {user.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
            </Button>
          )}
          {run.error && (
            <p role="alert" className="text-danger">
              {run.error.message}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  )
}

export function UsuariosPage() {
  const { profile } = useAuth()
  const profiles = useProfiles()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Profile | null>(null)

  // La seguridad real está en la Edge Function; esto solo evita una pantalla inútil.
  if (profile && profile.role !== 'contador') return <Navigate to="/" />

  return (
    <Page number="C1" title="Usuarios">
      <Card className="space-y-1">
        {profiles.isPending && <p className="text-ink-muted">Afinando…</p>}
        {profiles.error && (
          <p role="alert" className="text-danger">
            No pudimos cargar los usuarios. Revisa tu conexión.
          </p>
        )}
        {profiles.data?.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => setSelected(user)}
            className="-mx-3 flex min-h-16 w-[calc(100%+1.5rem)] items-center gap-3 rounded-control px-3 text-left active:bg-surface-2"
          >
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl"
            >
              {user.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block font-semibold ${user.activo ? '' : 'text-void line-through'}`}
              >
                {user.display_name}
              </span>
              <span className="block truncate text-sm text-ink-muted">
                @{user.username}
                {user.role === 'contador' && ' · contador'}
                {!user.participa_reparto && ' · sin reparto'}
                {!user.activo && ' · desactivado'}
              </span>
            </span>
            <span aria-hidden="true" className="text-ink-muted">
              ›
            </span>
          </button>
        ))}
      </Card>

      <Button size="lg" block onClick={() => setCreating(true)}>
        Nuevo usuario
      </Button>

      <NewUserSheet open={creating} onOpenChange={setCreating} />
      <UserSheet user={selected} onClose={() => setSelected(null)} />
    </Page>
  )
}
