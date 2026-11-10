// Catálogo de merch (solo contador): productos, variantes, precios, existencias
// y el detalle de cómo se formó el costo de cada una.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate } from '@tanstack/react-router'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { Card, EmptyState, Page } from '../../design/Page'
import { useToast } from '../../design/Toast'
import { useAuth } from '../../lib/auth'
import type { Json } from '../../lib/database.types'
import type { InventoryRow } from '../../lib/events'
import { centsToDecimalString, entryToCents, formatMXN, formatMXNShort } from '../../lib/money'
import { useInventory, useKardex, useNameOf } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass } from '../captura/parts'
import { CompraFlow, ConteoFlow, type Picked } from './StockFlows'

const CATEGORIES = [
  { value: 'playeras', label: 'Playeras', emoji: '👕' },
  { value: 'vinilos_cd', label: 'Vinilos y CD', emoji: '💿' },
  { value: 'stickers', label: 'Stickers', emoji: '⭐' },
  { value: 'pines', label: 'Pines', emoji: '📌' },
  { value: 'canas', label: 'Canas', emoji: '🧢' },
  { value: 'otros', label: 'Otros', emoji: '🎁' },
] as const

interface VariantDraft {
  id?: string
  label: string
  price: string
  threshold: string
  stock?: number
}
interface Draft {
  id?: string
  name: string
  emoji: string
  category: (typeof CATEGORIES)[number]['value']
  variants: VariantDraft[]
}

const emptyDraft = (): Draft => ({
  name: '',
  emoji: '👕',
  category: 'playeras',
  variants: [{ label: 'Única', price: '', threshold: '0' }],
})

const pesos = (cents: number | null) =>
  centsToDecimalString(BigInt(cents ?? 0)).replace(/\.00$/, '')
const validPrice = (text: string) => /^\d+(\.\d{1,2})?$/.test(text.trim())
const money = (cents: bigint | number | null) => formatMXN(BigInt(cents ?? 0))
const asPicked = (row: InventoryRow): Picked => ({
  variant: { ...row, stock: row.stock_qty ?? 0 },
  name: `${row.product_name} · ${row.label}`,
})

function ProductForm({ initial, onSaved }: { initial: Draft; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(initial)
  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }))

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_product', {
        p_payload: {
          id: draft.id,
          name: draft.name.trim(),
          emoji: draft.emoji.trim() || '👕',
          category: draft.category,
          variants: draft.variants.map((v) => ({
            id: v.id,
            label: v.label.trim(),
            price_cents: Number(entryToCents(v.price.trim())),
            low_stock_threshold: Number(v.threshold) || 0,
          })),
        } as unknown as Json,
      })
      if (error)
        throw new Error(
          /fetch|network/i.test(error.message) ? 'Necesitas internet.' : error.message,
        )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
      onSaved()
    },
  })

  const valid =
    draft.name.trim().length > 0 &&
    draft.variants.every((v) => v.label.trim() && validPrice(v.price))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) save.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Producto</span>
          <input
            className={fieldClass}
            value={draft.name}
            maxLength={60}
            placeholder="Ej. Playera Logo"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-ink-muted">Emoji</span>
          <input
            className={`${fieldClass} text-center`}
            value={draft.emoji}
            maxLength={8}
            onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
          />
        </label>
      </div>

      {!draft.id && (
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Chip
              key={category.value}
              emoji={category.emoji}
              selected={draft.category === category.value}
              onClick={() =>
                setDraft({ ...draft, category: category.value, emoji: category.emoji })
              }
            >
              {category.label}
            </Chip>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <p className="font-semibold">Tallas o colores</p>
        {draft.variants.map((variant, index) => (
          <fieldset
            key={variant.id ?? `nueva-${index}`}
            className="space-y-2 rounded-card border border-line p-3"
          >
            <legend className="sr-only">Variante {index + 1}</legend>
            <label className="block space-y-1">
              <span className="text-sm text-ink-muted">Talla o color</span>
              <input
                aria-label={`Variante ${index + 1}`}
                className={fieldClass}
                value={variant.label}
                maxLength={40}
                placeholder="Ej. M negra"
                onChange={(event) => setVariant(index, { label: event.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-sm text-ink-muted">Precio de venta ($)</span>
                <input
                  aria-label={`Precio de la variante ${index + 1}`}
                  className={`${fieldClass} tabular-nums`}
                  inputMode="decimal"
                  value={variant.price}
                  placeholder="350"
                  onChange={(event) => setVariant(index, { price: event.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-ink-muted">Avisar si quedan</span>
                <input
                  aria-label={`Avisar cuando queden (variante ${index + 1})`}
                  className={`${fieldClass} tabular-nums`}
                  inputMode="numeric"
                  value={variant.threshold}
                  onChange={(event) =>
                    setVariant(index, { threshold: event.target.value.replace(/\D/g, '') })
                  }
                />
              </label>
            </div>
            {variant.id && (
              <p className="text-sm text-ink-muted">
                Hay <strong className="text-ink">{variant.stock}</strong> en inventario.
              </p>
            )}
          </fieldset>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            setDraft({
              ...draft,
              variants: [...draft.variants, { label: '', price: '', threshold: '0' }],
            })
          }
        >
          ➕ Otra talla o color
        </Button>
        <p className="rounded-card bg-surface-2 p-3 text-sm">
          <strong>Las existencias no se escriben aquí.</strong> Cambian solas con cada movimiento:
          cuando entra merch, se vende, se regala o se cuenta. Para corregirlas, guarda y toca la
          variante en la lista.
        </p>
      </div>

      {save.error && (
        <p role="alert" className="text-danger">
          {save.error.message}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={!valid || save.isPending}>
        {save.isPending ? 'Guardando…' : 'Guardar producto'}
      </Button>
    </form>
  )
}

const KIND_LABEL: Record<string, string> = {
  compra: 'Compra',
  venta: 'Venta',
  regalo: 'Regalo',
  merma: 'Merma',
  ajuste: 'Conteo',
  anulacion: 'Anulación',
}

/** Saldo corrido: piezas y valor que quedan después de cada movimiento. */
function withRunningBalance<T extends { qty: number | null; cost_cents: number | null }>(
  rows: T[],
) {
  const result: (T & { stock: number; value: bigint })[] = []
  let stock = 0
  let value = 0n
  for (const row of rows) {
    stock += row.qty ?? 0
    value += BigInt(row.cost_cents ?? 0)
    result.push({ ...row, stock, value })
  }
  return result
}

/** Existencias, costo y cada movimiento que los formó. */
function VariantSheet({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const kardex = useKardex(row?.variant_id ?? null)
  const nameOf = useNameOf()
  const [tool, setTool] = useState<'entro' | 'conte' | null>(null)
  const close = () => {
    setTool(null)
    onClose()
  }

  const movements = withRunningBalance(kardex.data ?? [])

  return (
    <BottomSheet
      open={row !== null}
      onOpenChange={(open) => !open && close()}
      title={row ? `${row.emoji} ${row.product_name} · ${row.label}` : ''}
    >
      {row && tool === 'entro' && (
        <CompraFlow products={[]} initial={asPicked(row)} onDone={close} />
      )}
      {row && tool === 'conte' && (
        <ConteoFlow products={[]} initial={asPicked(row)} onDone={close} />
      )}
      {row && tool === null && (
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-control bg-surface-2 p-2">
              <dt className="text-xs text-ink-muted">Hay</dt>
              <dd className="display text-2xl tabular-nums">{row.stock_qty}</dd>
            </div>
            <div className="rounded-control bg-surface-2 p-2">
              <dt className="text-xs text-ink-muted">Costo por pieza</dt>
              <dd className="display text-2xl tabular-nums">
                {formatMXNShort(BigInt(row.avg_cost_cents ?? 0))}
              </dd>
            </div>
            <div className="rounded-control bg-surface-2 p-2">
              <dt className="text-xs text-ink-muted">Valen</dt>
              <dd className="display text-2xl tabular-nums">
                {formatMXNShort(BigInt(row.stock_value_cents ?? 0))}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setTool('entro')}>
              📦 Entró merch
            </Button>
            <Button variant="secondary" onClick={() => setTool('conte')}>
              🔢 Corregir existencias
            </Button>
          </div>

          <p className="rounded-card bg-surface-2 p-3 text-sm">
            <strong>Cómo se calcula el costo.</strong> Cada entrada suma sus piezas y lo que
            costaron. El costo por pieza es el promedio: lo que valen todas entre cuántas hay. Con
            ese costo sale cada pieza que se vende (costo de venta), se regala (merch regalado) o se
            da de baja (merma).
          </p>

          <section aria-label="Movimientos">
            <h3 className="label-mono pb-1 text-ink-muted">Movimientos</h3>
            {kardex.isPending && <p className="text-ink-muted">Afinando…</p>}
            {kardex.data?.length === 0 && (
              <p className="text-ink-muted">Todavía no hay movimientos.</p>
            )}
            <ul className="divide-y divide-line">
              {movements.map((m) => (
                <li key={m.movement_id} className="py-2 text-sm tabular-nums">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {m.is_opening ? 'Saldo inicial' : (KIND_LABEL[m.kind ?? ''] ?? m.kind)}
                      <span className="font-normal text-ink-muted">
                        {' '}
                        ·{' '}
                        {new Date(m.captured_at ?? '').toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        · {nameOf(m.created_by)}
                      </span>
                    </span>
                    <span className={`font-semibold ${(m.qty ?? 0) > 0 ? 'text-in' : ''}`}>
                      {(m.qty ?? 0) > 0 ? '+' : '−'}
                      {Math.abs(m.qty ?? 0)} pzas
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-ink-muted">
                    <span>
                      {Math.abs(m.qty ?? 0)} × {money(m.unit_cost_cents)} ={' '}
                      {money(Math.abs(m.cost_cents ?? 0))}
                    </span>
                    <span>
                      Quedan {m.stock} · {money(m.value)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </BottomSheet>
  )
}

export function ProductosPage() {
  const { profile } = useAuth()
  const inventory = useInventory()
  const { toast } = useToast()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  if (profile && profile.role !== 'contador') return <Navigate to="/merch" />

  const products = new Map<string, InventoryRow[]>()
  for (const row of inventory.data ?? []) {
    if (!row.product_id) continue
    products.set(row.product_id, [...(products.get(row.product_id) ?? []), row])
  }
  const total = (inventory.data ?? []).reduce(
    (sum, row) => sum + BigInt(row.stock_value_cents ?? 0),
    0n,
  )
  const viewed = inventory.data?.find((row) => row.variant_id === viewing) ?? null

  const edit = (rows: InventoryRow[]) =>
    setEditing({
      id: rows[0]!.product_id!,
      name: rows[0]!.product_name ?? '',
      emoji: rows[0]!.emoji ?? '👕',
      category: rows[0]!.category ?? 'otros',
      variants: rows.map((row) => ({
        id: row.variant_id!,
        label: row.label ?? '',
        price: pesos(row.price_cents),
        threshold: String(row.low_stock_threshold ?? 0),
        stock: row.stock_qty ?? 0,
      })),
    })

  return (
    <Page number="C5" title="Productos y precios">
      {products.size === 0 && !inventory.isPending && (
        <EmptyState
          emoji="🏷️"
          title="Sin productos"
          hint="Da de alta el primero con sus tallas y precios."
        />
      )}
      {products.size > 0 && (
        <Card>
          <p className="text-ink-muted">Inventario valuado a costo</p>
          <p className="display mt-1 text-4xl tabular-nums">{formatMXN(total)}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Toca una talla o color para ver sus movimientos, su costo y corregir existencias.
          </p>
        </Card>
      )}

      {[...products.values()].map((rows) => (
        <Card key={rows[0]!.product_id}>
          <button
            type="button"
            onClick={() => edit(rows)}
            className="flex min-h-12 w-full items-center justify-between text-left"
          >
            <span className="text-lg font-semibold">
              <span aria-hidden="true">{rows[0]!.emoji}</span> {rows[0]!.product_name}
            </span>
            <span className="text-sm font-semibold text-accent">Editar nombre y precios</span>
          </button>
          <div className="mt-1 grid grid-cols-[1fr_4rem_4rem_3rem] gap-2 text-sm text-ink-muted">
            <span>Variante</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Costo</span>
            <span className="text-right">Hay</span>
          </div>
          {rows.map((row) => (
            <button
              key={row.variant_id}
              type="button"
              aria-label={`${row.label} ${formatMXNShort(BigInt(row.price_cents ?? 0))} ${formatMXNShort(BigInt(row.avg_cost_cents ?? 0))} ${row.stock_qty}`}
              onClick={() => setViewing(row.variant_id)}
              className="-mx-2 grid min-h-12 w-[calc(100%+1rem)] grid-cols-[1fr_4rem_4rem_3rem] items-center gap-2 rounded-control border-t border-line px-2 text-left tabular-nums active:bg-surface-2"
            >
              <span>{row.label}</span>
              <span className="text-right">{formatMXNShort(BigInt(row.price_cents ?? 0))}</span>
              <span className="text-right">{formatMXNShort(BigInt(row.avg_cost_cents ?? 0))}</span>
              <span
                className={`text-right font-semibold ${
                  row.stock_status === 'negativo'
                    ? 'text-danger'
                    : row.stock_status === 'bajo'
                      ? 'text-pending'
                      : ''
                }`}
              >
                {row.stock_qty}
              </span>
            </button>
          ))}
        </Card>
      ))}

      <Button size="lg" block onClick={() => setEditing(emptyDraft())}>
        Nuevo producto
      </Button>

      <BottomSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? 'Editar producto' : 'Nuevo producto'}
      >
        {editing && (
          <ProductForm
            key={editing.id ?? 'nuevo'}
            initial={editing}
            onSaved={() => {
              toast({ message: 'Producto guardado.' })
              setEditing(null)
            }}
          />
        )}
      </BottomSheet>

      <VariantSheet row={viewed} onClose={() => setViewing(null)} />
    </Page>
  )
}
