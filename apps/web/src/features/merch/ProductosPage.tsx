// Catálogo de merch (solo contador): productos, variantes, precios y alertas.
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
import { useInventory } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { fieldClass } from '../captura/parts'

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

      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Variantes (talla, color) con su precio de venta</p>
        {draft.variants.map((variant, index) => (
          <div
            key={variant.id ?? `nueva-${index}`}
            className="grid grid-cols-[1fr_6rem_4.5rem] gap-2"
          >
            <input
              aria-label={`Variante ${index + 1}`}
              className={fieldClass}
              value={variant.label}
              maxLength={40}
              placeholder="Ej. M negra"
              onChange={(event) => setVariant(index, { label: event.target.value })}
            />
            <input
              aria-label={`Precio de la variante ${index + 1}`}
              className={`${fieldClass} px-3 tabular-nums`}
              inputMode="decimal"
              value={variant.price}
              placeholder="$"
              onChange={(event) => setVariant(index, { price: event.target.value })}
            />
            <input
              aria-label={`Avisar cuando queden (variante ${index + 1})`}
              className={`${fieldClass} px-3 tabular-nums`}
              inputMode="numeric"
              value={variant.threshold}
              title="Avisar cuando queden"
              onChange={(event) =>
                setVariant(index, { threshold: event.target.value.replace(/\D/g, '') })
              }
            />
          </div>
        ))}
        <p className="text-sm text-ink-muted">Nombre · precio · avisar cuando queden</p>
        <Button
          variant="secondary"
          onClick={() =>
            setDraft({
              ...draft,
              variants: [...draft.variants, { label: '', price: '', threshold: '0' }],
            })
          }
        >
          ➕ Otra variante
        </Button>
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

export function ProductosPage() {
  const { profile } = useAuth()
  const inventory = useInventory()
  const { toast } = useToast()
  const [editing, setEditing] = useState<Draft | null>(null)

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
            <span className="text-sm font-semibold text-accent">Editar</span>
          </button>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="pb-1 font-medium">Variante</th>
                <th className="pb-1 text-right font-medium">Precio</th>
                <th className="pb-1 text-right font-medium">Costo</th>
                <th className="pb-1 text-right font-medium">Hay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.variant_id} className="border-t border-line">
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right">
                    {formatMXNShort(BigInt(row.price_cents ?? 0))}
                  </td>
                  <td className="py-1.5 text-right">
                    {formatMXNShort(BigInt(row.avg_cost_cents ?? 0))}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${
                      row.stock_status === 'negativo'
                        ? 'text-danger'
                        : row.stock_status === 'bajo'
                          ? 'text-pending'
                          : ''
                    }`}
                  >
                    {row.stock_qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </Page>
  )
}
