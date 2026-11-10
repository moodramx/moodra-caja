// Giras, shows y proyectos: cualquier integrante puede crearlos y asignarles
// lo que registra.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import type { Project } from '../../lib/events'
import { formatMXNShort } from '../../lib/money'
import {
  useActiveProject,
  useProjectPnl,
  useProjects,
  useProjectTypes,
  useShows,
  type ShowRow,
} from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass, Option } from '../captura/parts'

/** Alta rápida: nombre + tipo. */
export function NewProjectForm({ onCreated }: { onCreated: (project: Project) => void }) {
  const types = useProjectTypes()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [typeCode, setTypeCode] = useState('SHW')

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_project', {
        p_type_code: typeCode,
        p_name: name.trim(),
      })
      if (error) {
        throw new Error(
          /fetch|network/i.test(error.message) ? 'Necesitas internet para crearlo.' : error.message,
        )
      }
      return data
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setName('')
      onCreated(project)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (name.trim()) create.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block space-y-2">
        <span className="text-sm text-ink-muted">Nombre</span>
        <input
          className={fieldClass}
          value={name}
          maxLength={80}
          placeholder="Ej. Foro Indie Rocks · 14 nov"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {types.data
          ?.filter((type) => type.code !== 'OPE')
          .map((type) => (
            <Chip
              key={type.code}
              emoji={type.emoji}
              selected={typeCode === type.code}
              onClick={() => setTypeCode(type.code)}
            >
              {type.name}
            </Chip>
          ))}
      </div>
      {create.error && (
        <p role="alert" className="text-danger">
          {create.error.message}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={!name.trim() || create.isPending}>
        {create.isPending ? 'Creando…' : 'Crear'}
      </Button>
    </form>
  )
}

/** Lista para elegir proyecto (o ninguno), con alta rápida al final. */
export function ProjectList({
  onSelect,
  onSelectShow,
}: {
  onSelect: (project: Project | null) => void
  /** Si se da, las giras con varios shows listan cada uno para elegirlo. */
  onSelectShow?: (show: ShowRow) => void
}) {
  const projects = useProjects()
  const shows = useShows()
  const showsOf = (projectId: string) =>
    (shows.data ?? []).filter((s) => s.project_id === projectId && s.status !== 'cancelado')
  const [creating, setCreating] = useState(false)

  if (creating) {
    return (
      <div className="space-y-4">
        <NewProjectForm onCreated={onSelect} />
        <Button variant="ghost" block onClick={() => setCreating(false)}>
          Cancelar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Option
        emoji="🏠"
        label="Operación general"
        hint="Nada en especial"
        onClick={() => onSelect(null)}
      />
      {projects.data?.map((project) => (
        <div key={project.id} className="space-y-2">
          <Option
            emoji={project.type?.emoji ?? '📁'}
            label={project.name}
            hint={project.type?.name}
            onClick={() => onSelect(project)}
          />
          {onSelectShow &&
            showsOf(project.id).length > 1 &&
            showsOf(project.id).map((show) => (
              <div key={show.id} className="pl-6">
                <Option
                  emoji="🎸"
                  label={show.name}
                  hint="Show de esta gira"
                  onClick={() => onSelectShow(show)}
                />
              </div>
            ))}
        </div>
      ))}
      <Option
        emoji="➕"
        label="Nueva gira, show o proyecto"
        hint="Cualquiera de la banda puede crearlo"
        onClick={() => setCreating(true)}
      />
    </div>
  )
}

/**
 * A qué gira, show o proyecto va una captura. Arranca con el contexto activo
 * ("¿En qué andamos?") y se puede cambiar solo para ese registro.
 */
export function useCaptureProject() {
  const context = useActiveProject()
  const projects = useProjects()
  const [override, setOverride] = useState<string | null | undefined>(undefined)
  const projectId = override === undefined ? context.id : override
  return {
    projectId,
    // El show del contexto solo aplica mientras no se cambie el proyecto a mano.
    showId: override === undefined ? context.showId : null,
    project: projects.data?.find((p) => p.id === projectId) ?? null,
    setProjectId: setOverride,
  }
}

export function ProjectPicker({
  project,
  onChange,
}: {
  project: { name: string; type?: { emoji: string } | null } | null
  onChange: (projectId: string | null) => void
}) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="space-y-2 rounded-card border border-line bg-surface-2 p-3">
        <p className="text-sm text-ink-muted">¿Para qué fue?</p>
        <ProjectList
          onSelect={(next) => {
            onChange(next?.id ?? null)
            setOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Cambiar para qué fue"
      className="flex min-h-12 w-full items-center gap-2 rounded-control border border-line bg-bg px-4 text-left active:bg-surface-2"
    >
      <span aria-hidden="true">{project?.type?.emoji ?? '🏠'}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-ink-muted">Para: </span>
        {project?.name ?? 'Operación general'}
      </span>
      <span className="text-sm font-semibold text-accent">Cambiar</span>
    </button>
  )
}

/** Cuánto ha dejado la gira o el proyecto: lo de sus shows, su merch y sus gastos. */
function ProjectNet({ projectId }: { projectId: string }) {
  const pnl = useProjectPnl()
  const row = pnl.data?.find((p) => p.project_id === projectId)
  const net = BigInt(row?.net_cents ?? 0)
  if (!row || (net === 0n && !row.show_income_cents && !row.costs_cents)) return null
  return (
    <span
      aria-label={`Resultado de ${row.name}`}
      className={`shrink-0 font-semibold tabular-nums ${net > 0n ? 'text-in' : net < 0n ? 'text-danger' : ''}`}
    >
      {net >= 0n ? '+' : '−'}
      {formatMXNShort(net < 0n ? -net : net)}
    </span>
  )
}

/** Pantalla de proyectos (en Más), para todos. */
export function ProyectosPage() {
  const projects = useProjects()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)

  return (
    <Page number="06" title="Giras y proyectos">
      {projects.data?.length === 0 && (
        <EmptyState
          emoji="🚐"
          title="Todavía no hay ninguno"
          hint="Crea una gira o un show para ir juntando lo que se gasta y se cobra ahí."
        />
      )}
      {projects.data && projects.data.length > 0 && (
        <Card className="divide-y divide-line">
          {projects.data.map((project) => (
            <div key={project.id} className="flex min-h-14 items-center gap-3 py-2">
              <span aria-hidden="true" className="text-2xl">
                {project.type?.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{project.name}</span>
                <span className="block text-sm text-ink-muted">{project.type?.name}</span>
              </span>
              <ProjectNet projectId={project.id} />
            </div>
          ))}
        </Card>
      )}
      <Button size="lg" block onClick={() => setOpen(true)}>
        Nueva gira, show o proyecto
      </Button>

      <BottomSheet open={open} onOpenChange={setOpen} title="Nueva gira, show o proyecto">
        <NewProjectForm
          onCreated={(project) => {
            toast({ message: `Listo: "${project.name}" ya se puede elegir al registrar.` })
            setOpen(false)
          }}
        />
      </BottomSheet>
    </Page>
  )
}
