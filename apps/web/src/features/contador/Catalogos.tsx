// Catálogos editables (Fase 5c): cuentas, categorías, tipos de proyecto y contactos.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAccounts, useAllCategories, useContacts, useProjectTypes } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass } from '../captura/parts'
import { ContadorOnly } from './ContadorPages'

type Tab = 'cuentas' | 'categorias' | 'tipos' | 'contactos'
const TABS: { key: Tab; label: string }[] = [
  { key: 'cuentas', label: 'Cuentas' },
  { key: 'categorias', label: 'Categorías' },
  { key: 'tipos', label: 'Tipos de proyecto' },
  { key: 'contactos', label: 'Contactos' },
]
const CONTACT_KINDS = [
  { key: 'venue', label: 'Venue' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'tercero', label: 'Tercero' },
  { key: 'otro', label: 'Otro' },
] as const

const errorText = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : 'No se pudo guardar'

/** Guarda con una RPC, refresca y avisa. */
function useSave() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const save = async (job: PromiseLike<{ error: unknown }>, done = 'Guardado ✓') => {
    setBusy(true)
    const { error } = await job
    setBusy(false)
    if (error) {
      toast({ message: errorText(error) })
      return false
    }
    await queryClient.invalidateQueries()
    toast({ message: done })
    return true
  }
  return { busy, save }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function CatalogosPage() {
  const [tab, setTab] = useState<Tab>('cuentas')
  return (
    <ContadorOnly>
      <Page number="C7" title="Catálogos">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Catálogo">
          {TABS.map((option) => (
            <Chip key={option.key} selected={tab === option.key} onClick={() => setTab(option.key)}>
              {option.label}
            </Chip>
          ))}
        </div>
        {tab === 'cuentas' && <Cuentas />}
        {tab === 'categorias' && <Categorias />}
        {tab === 'tipos' && <Tipos />}
        {tab === 'contactos' && <Contactos />}
      </Page>
    </ContadorOnly>
  )
}

function Cuentas() {
  const accounts = useAccounts()
  const { busy, save } = useSave()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const rows = (accounts.data ?? []).filter((a) => !a.member_id)

  return (
    <>
      <Card>
        <p className="font-semibold">Cuenta nueva</p>
        <p className="mt-1 text-sm text-ink-muted">
          El código dice de qué cuenta cuelga: 6.12 cuelga de 6 y hereda su tipo.
        </p>
        <div className="mt-3 space-y-3">
          <Field label="Código" value={code} onChange={setCode} placeholder="6.12" />
          <Field
            label="Nombre de la cuenta"
            value={name}
            onChange={setName}
            placeholder="Mensajería"
          />
          <Button
            block
            disabled={busy || !code.trim() || !name.trim()}
            onClick={async () => {
              if (await save(supabase.rpc('save_account', { p: { code, name } }))) {
                setCode('')
                setName('')
              }
            }}
          >
            Agregar cuenta
          </Button>
        </div>
      </Card>
      <Card>
        <p className="font-semibold">Catálogo de cuentas</p>
        <ul className="mt-2 divide-y divide-line text-sm">
          {rows.map((account) => (
            <li key={account.id} className="py-2">
              {editing?.id === account.id ? (
                <div className="space-y-2">
                  <Field
                    label={`Nombre de ${account.code}`}
                    value={editing.name}
                    onChange={(value) => setEditing({ id: account.id, name: value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={busy || !editing.name.trim()}
                      onClick={async () => {
                        if (
                          await save(
                            supabase.rpc('save_account', {
                              p: { id: account.id, name: editing.name },
                            }),
                          )
                        )
                          setEditing(null)
                      }}
                    >
                      Guardar
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void save(
                          supabase.rpc('save_account', {
                            p: { id: account.id, name: account.name, active: !account.active },
                          }),
                          account.active ? 'Cuenta desactivada' : 'Cuenta activada',
                        ).then(() => setEditing(null))
                      }
                    >
                      {account.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`flex w-full justify-between gap-3 text-left ${account.active ? '' : 'text-ink-faint line-through'}`}
                  onClick={() => setEditing({ id: account.id, name: account.name })}
                >
                  <span className={account.is_postable ? '' : 'font-semibold'}>
                    <span className="font-mono text-xs text-ink-muted">{account.code}</span>{' '}
                    {account.name}
                  </span>
                  <span className="text-ink-muted">{account.type}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Categorias() {
  const categories = useAllCategories()
  const accounts = useAccounts()
  const { busy, save } = useSave()
  const [kind, setKind] = useState<'gasto' | 'ingreso'>('gasto')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [general, setGeneral] = useState('')
  const [show, setShow] = useState('')
  const postable = (accounts.data ?? []).filter((a) => a.is_postable && a.active && !a.member_id)
  const options = postable.filter((a) =>
    kind === 'gasto' ? ['costo', 'gasto', 'otro'].includes(a.type) : a.type === 'ingreso',
  )
  const codeOf = (id: string | null) => (accounts.data ?? []).find((a) => a.id === id)?.code ?? ''

  return (
    <>
      <Card>
        <p className="font-semibold">Categoría nueva</p>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de categoría">
            <Chip selected={kind === 'gasto'} onClick={() => setKind('gasto')}>
              De gasto
            </Chip>
            <Chip selected={kind === 'ingreso'} onClick={() => setKind('ingreso')}>
              De cobro
            </Chip>
          </div>
          <Field
            label="Nombre de la categoría"
            value={name}
            onChange={setName}
            placeholder="Mensajería"
          />
          <Field label="Emoji" value={emoji} onChange={setEmoji} placeholder="📦" />
          <label className="block">
            <span className="text-sm text-ink-muted">Cuenta general</span>
            <select
              className={fieldClass}
              value={general}
              onChange={(event) => setGeneral(event.target.value)}
            >
              <option value="">Elige una cuenta…</option>
              {options.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'gasto' && (
            <label className="block">
              <span className="text-sm text-ink-muted">Cuenta cuando es de un show (opcional)</span>
              <select
                className={fieldClass}
                value={show}
                onChange={(event) => setShow(event.target.value)}
              >
                <option value="">La misma</option>
                {options.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            block
            disabled={busy || !name.trim() || !general}
            onClick={async () => {
              const ok = await save(
                supabase.rpc('save_category', {
                  p: { name, emoji, kind, account_general_code: general, account_show_code: show },
                }),
              )
              if (ok) {
                setName('')
                setEmoji('')
              }
            }}
          >
            Agregar categoría
          </Button>
        </div>
      </Card>
      <Card>
        <p className="font-semibold">Categorías</p>
        <ul className="mt-2 divide-y divide-line">
          {(categories.data ?? []).map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2">
              <span className={category.active ? '' : 'text-ink-faint line-through'}>
                {category.emoji} {category.name}{' '}
                <span className="text-sm text-ink-muted">
                  · {category.kind} · {codeOf(category.account_general_id)}
                </span>
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void save(
                    supabase.rpc('save_category', {
                      p: {
                        id: category.id,
                        name: category.name,
                        account_general_code: codeOf(category.account_general_id),
                        account_show_code: codeOf(category.account_show_id),
                        active: !category.active,
                      },
                    }),
                    category.active ? 'Categoría desactivada' : 'Categoría activada',
                  )
                }
              >
                {category.active ? 'Desactivar' : 'Activar'}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Tipos() {
  const types = useProjectTypes()
  const { busy, save } = useSave()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [isShow, setIsShow] = useState(false)

  return (
    <>
      <Card>
        <p className="font-semibold">Tipo de proyecto nuevo</p>
        <div className="mt-3 space-y-3">
          <Field
            label="Clave (3 letras)"
            value={code}
            onChange={(v) => setCode(v.toUpperCase().slice(0, 3))}
            placeholder="VID"
          />
          <Field label="Nombre del tipo" value={name} onChange={setName} placeholder="Videoclip" />
          <Field label="Emoji" value={emoji} onChange={setEmoji} placeholder="🎬" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Es de shows">
            <Chip selected={!isShow} onClick={() => setIsShow(false)}>
              Proyecto general
            </Chip>
            <Chip selected={isShow} onClick={() => setIsShow(true)}>
              Con shows (usa costos de show)
            </Chip>
          </div>
          <Button
            block
            disabled={busy || code.length !== 3 || !name.trim()}
            onClick={async () => {
              const ok = await save(
                supabase.rpc('save_project_type', { p: { code, name, emoji, is_show: isShow } }),
              )
              if (ok) {
                setCode('')
                setName('')
                setEmoji('')
              }
            }}
          >
            Agregar tipo
          </Button>
        </div>
      </Card>
      <Card>
        <p className="font-semibold">Tipos de proyecto</p>
        <ul className="mt-2 divide-y divide-line">
          {(types.data ?? []).map((type) => (
            <li key={type.id} className="flex justify-between gap-3 py-2">
              <span>
                {type.emoji} {type.name}
              </span>
              <span className="text-sm text-ink-muted">
                {type.code}
                {type.is_show ? ' · con shows' : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Contactos() {
  const contacts = useContacts()
  const { busy, save } = useSave()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<(typeof CONTACT_KINDS)[number]['key']>('venue')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')

  return (
    <>
      <Card>
        <p className="font-semibold">Contacto nuevo</p>
        <div className="mt-3 space-y-3">
          <Field
            label="Nombre del contacto"
            value={name}
            onChange={setName}
            placeholder="Foro Indie Rocks"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de contacto">
            {CONTACT_KINDS.map((option) => (
              <Chip
                key={option.key}
                selected={kind === option.key}
                onClick={() => setKind(option.key)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <Field label="Ciudad" value={city} onChange={setCity} />
          <Field label="Teléfono" value={phone} onChange={setPhone} />
          <Button
            block
            disabled={busy || !name.trim()}
            onClick={async () => {
              if (await save(supabase.rpc('save_contact', { p: { name, kind, city, phone } }))) {
                setName('')
                setCity('')
                setPhone('')
              }
            }}
          >
            Agregar contacto
          </Button>
        </div>
      </Card>
      <Card>
        <p className="font-semibold">Contactos</p>
        {contacts.data?.length === 0 && (
          <p className="mt-1 text-ink-muted">Todavía no hay contactos.</p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {(contacts.data ?? []).map((contact) => (
            <li key={contact.id} className="py-2">
              <span className="font-semibold">{contact.name}</span>{' '}
              <span className="text-sm text-ink-muted">
                · {contact.kind}
                {contact.city ? ` · ${contact.city}` : ''}
                {contact.phone ? ` · ${contact.phone}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
