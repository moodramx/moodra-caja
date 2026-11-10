// Punto de venta de merch. Funciona sin señal: precios y existencias salen de
// la caché, y las ventas pendientes ya descuentan del stock que se muestra.
import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { BottomSheet } from '../../design/BottomSheet'
import { Button } from '../../design/Button'
import { Chip } from '../../design/Chip'
import { cx } from '../../design/cx'
import { Card, EmptyState, Page } from '../../design/Page'
import { useAuth } from '../../lib/auth'
import type {
  InventoryRow,
  PaymentMethod,
  SaleChannel,
  SaleLine,
  VentaPayload,
} from '../../lib/events'
import { describeVenta } from '../../lib/humanize'
import { addToCart, cartTotals, pendingStock, setQty, toggleGift } from '../../lib/merch'
import { formatMXNShort } from '../../lib/money'
import { useOutbox } from '../../lib/offline/runtime'
import { useActiveProject, useInventory, useMerchToday, useProfiles } from '../../lib/queries'
import { useCapture } from '../captura/parts'
import { ChangeCalculator, CostNote, PhotosTool, ProductImage, type Product } from './MerchParts'
import { CompraFlow, ConteoFlow, SalidaFlow } from './StockFlows'

const money = (cents: bigint | number | null) => formatMXNShort(BigInt(cents ?? 0))

const CHANNELS: { value: SaleChannel; label: string; emoji: string }[] = [
  { value: 'show', label: 'Show', emoji: '🎸' },
  { value: 'bandcamp', label: 'Bandcamp', emoji: '💿' },
  { value: 'otro', label: 'Otro', emoji: '🧾' },
]

export type { Product }

/** Agrupa el inventario por producto y aplica lo vendido que aún no sincroniza. */
function useCatalog() {
  const { session } = useAuth()
  const inventory = useInventory()
  const ops = useOutbox(session?.user.id)

  const products = useMemo(() => {
    const pending = pendingStock(ops)
    const byProduct = new Map<string, Product>()
    for (const row of inventory.data ?? []) {
      if (!row.active || !row.product_id || !row.variant_id) continue
      const product = byProduct.get(row.product_id) ?? {
        id: row.product_id,
        name: row.product_name ?? '',
        emoji: row.emoji ?? '👕',
        photoPath: row.photo_path ?? null,
        variants: [],
      }
      product.variants.push({
        ...row,
        stock: (row.stock_qty ?? 0) + (pending.get(row.variant_id) ?? 0),
      })
      byProduct.set(row.product_id, product)
    }
    return [...byProduct.values()]
  }, [inventory.data, ops])

  return { products, isPending: inventory.isPending }
}

function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock < 0) return <span className="font-semibold text-danger">Faltan {-stock}</span>
  if (stock === 0) return <span className="font-semibold text-pending">Agotado</span>
  if (stock <= threshold) return <span className="font-semibold text-pending">Quedan {stock}</span>
  return <span className="text-ink-muted">{stock} pzas</span>
}

/** "Hoy vendimos 14 piezas · $4,350 · margen $2,610" */
function NightSummary() {
  const today = useMerchToday()
  if (!today.data || today.data.pieces === 0) return null
  return (
    <Card>
      <p className="text-ink-muted">Hoy vendimos</p>
      <p className="display mt-1 text-4xl tabular-nums">{money(today.data.revenue)}</p>
      <p className="mt-1 text-ink-muted">
        {today.data.pieces} {today.data.pieces === 1 ? 'pieza' : 'piezas'} · nos quedan{' '}
        <strong className="text-in">{money(today.data.revenue - today.data.cost)}</strong> después
        del costo
      </p>
    </Card>
  )
}

type Tool = 'compra' | 'regalo' | 'merma' | 'conteo' | 'fotos'

export function MerchPage() {
  const { profile } = useAuth()
  const { products, isPending } = useCatalog()
  const profiles = useProfiles()
  const context = useActiveProject()
  const capture = useCapture()

  const [cart, setCart] = useState<SaleLine[]>([])
  const [choosing, setChoosing] = useState<Product | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const [channel, setChannel] = useState<SaleChannel | null>(null)
  const [collector, setCollector] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool | null>(null)

  const isContador = profile?.role === 'contador'
  const totals = cartTotals(cart)
  const variantOf = (id: string) =>
    products.flatMap((p) => p.variants).find((v) => v.variant_id === id)
  const nameOf = (id: string) => {
    const product = products.find((p) => p.variants.some((v) => v.variant_id === id))
    const variant = variantOf(id)
    return product && product.variants.length > 1
      ? `${product.name} · ${variant?.label}`
      : (product?.name ?? '')
  }
  const inCart = (variantId: string) =>
    cart.filter((l) => l.variant_id === variantId).reduce((sum, l) => sum + l.qty, 0)

  const add = (variant: InventoryRow) => {
    navigator.vibrate?.(8)
    setCart((lines) =>
      addToCart(lines, {
        variant_id: variant.variant_id!,
        unit_price_cents: variant.price_cents ?? 0,
      }),
    )
  }
  // Por default: Show si andamos en una gira o show; si no, Otro.
  const activeChannel = channel ?? (context.project?.type?.is_show ? 'show' : 'otro')

  const charge = () => {
    const payload: VentaPayload = {
      lines: cart,
      payment_method: method,
      channel: activeChannel,
      collected_by: collector ?? profile?.id,
      project_id: context.id,
    }
    void capture('venta_merch', payload, 'Venta guardada ✓')
    setDone(totals.total > 0n ? money(totals.total) : '🎁')
    setCart([])
    setCheckout(false)
    setCollector(null)
    setTimeout(() => setDone(null), 900)
  }

  return (
    <Page number="03" title="Merch">
      <NightSummary />

      {isPending && <p className="text-ink-muted">Afinando…</p>}
      {!isPending && products.length === 0 && (
        <EmptyState
          emoji="👕"
          title="La mesa de merch está vacía"
          hint={
            isContador
              ? 'Da de alta los productos para empezar a vender.'
              : 'Diego da de alta los productos y sus precios.'
          }
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        {products.map((product) => {
          const single = product.variants.length === 1 ? product.variants[0] : undefined
          const count = product.variants.reduce((sum, v) => sum + inCart(v.variant_id!), 0)
          const prices = product.variants.map((v) => v.price_cents ?? 0)
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => (single ? add(single) : setChoosing(product))}
              className="relative flex min-h-36 flex-col items-start justify-between rounded-card border border-line bg-surface p-4 text-left transition-transform duration-100 select-none active:scale-[0.98] active:bg-surface-2"
            >
              {count > 0 && (
                <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-bg tabular-nums">
                  {count}
                </span>
              )}
              <ProductImage product={product} />
              <span className="w-full">
                <span className="block font-semibold">{product.name}</span>
                <span className="block text-lg font-semibold tabular-nums">
                  {money(Math.min(...prices))}
                  {Math.max(...prices) !== Math.min(...prices) && '+'}
                </span>
                <span className="block text-sm">
                  {single ? (
                    <StockBadge stock={single.stock} threshold={single.low_stock_threshold ?? 0} />
                  ) : (
                    <span className="text-ink-muted">{product.variants.length} opciones</span>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <Card className="space-y-1">
        <p className="label-mono text-ink-muted">Existencias</p>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="secondary" onClick={() => setTool('compra')}>
            📦 Entró merch
          </Button>
          <Button variant="secondary" onClick={() => setTool('regalo')}>
            🎁 Regalé
          </Button>
          <Button variant="secondary" className="col-span-2" onClick={() => setTool('fotos')}>
            📷 Fotos de productos
          </Button>
          {isContador && (
            <>
              <Button variant="secondary" onClick={() => setTool('merma')}>
                🗑️ Se dañó
              </Button>
              <Button variant="secondary" onClick={() => setTool('conteo')}>
                🔢 Conté
              </Button>
            </>
          )}
        </div>
        {isContador && (
          <Link
            to="/contador/productos"
            className="-mx-3 flex min-h-14 items-center justify-between rounded-control px-3 font-semibold active:bg-surface-2"
          >
            <span>🏷️ Productos y precios</span>
            <span aria-hidden="true" className="text-ink-muted">
              ›
            </span>
          </Link>
        )}
      </Card>

      {/* Barra del carrito, fija sobre la navegación */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-md px-4">
          <Button
            size="lg"
            block
            className="shadow-lg shadow-black/25"
            onClick={() => setCheckout(true)}
          >
            {totals.pieces} {totals.pieces === 1 ? 'pza' : 'pzas'} · Cobrar {money(totals.total)}
          </Button>
        </div>
      )}
      {cart.length > 0 && <div aria-hidden="true" className="h-16" />}

      {/* Selector de variante */}
      <BottomSheet
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
        title={choosing ? `${choosing.emoji} ${choosing.name}` : ''}
        description="Toca una opción para agregarla."
      >
        <div className="space-y-2">
          {choosing?.variants.map((variant) => (
            <button
              key={variant.variant_id}
              type="button"
              onClick={() => add(variant)}
              className="flex min-h-16 w-full items-center justify-between gap-3 rounded-control border border-line bg-bg px-4 text-left active:bg-surface-2"
            >
              <span>
                <span className="block text-lg font-semibold">{variant.label}</span>
                <span className="block text-sm">
                  <StockBadge stock={variant.stock} threshold={variant.low_stock_threshold ?? 0} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{money(variant.price_cents)}</span>
                {inCart(variant.variant_id!) > 0 && (
                  <span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-bg tabular-nums">
                    {inCart(variant.variant_id!)}
                  </span>
                )}
              </span>
            </button>
          ))}
          <Button block className="mt-2" onClick={() => setChoosing(null)}>
            Listo
          </Button>
        </div>
      </BottomSheet>

      {/* Cobro */}
      <BottomSheet open={checkout} onOpenChange={setCheckout} title="🧾 Cobrar">
        <div className="space-y-4">
          <ul className="divide-y divide-line">
            {cart.map((line, index) => (
              <li key={`${line.variant_id}-${line.is_gift}`} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{nameOf(line.variant_id)}</span>
                  <span className="font-semibold tabular-nums">
                    {line.is_gift ? 'Regalo' : money(line.unit_price_cents * line.qty)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Quitar una de ${nameOf(line.variant_id)}`}
                      onClick={() => setCart((lines) => setQty(lines, index, line.qty - 1))}
                      className="grid size-12 place-items-center rounded-full border border-line text-2xl active:bg-surface-2"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-lg font-semibold tabular-nums">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={`Agregar una de ${nameOf(line.variant_id)}`}
                      onClick={() => setCart((lines) => setQty(lines, index, line.qty + 1))}
                      className="grid size-12 place-items-center rounded-full border border-line text-2xl active:bg-surface-2"
                    >
                      +
                    </button>
                  </div>
                  <Chip
                    emoji="🎁"
                    selected={line.is_gift}
                    onClick={() =>
                      setCart((lines) =>
                        toggleGift(lines, index, variantOf(line.variant_id)?.price_cents ?? 0),
                      )
                    }
                  >
                    Regalo
                  </Chip>
                </div>
              </li>
            ))}
          </ul>

          {totals.total > 0n && (
            <div className="flex flex-wrap gap-2">
              <Chip
                emoji="💵"
                selected={method === 'efectivo'}
                onClick={() => setMethod('efectivo')}
              >
                Efectivo
              </Chip>
              <Chip
                emoji="📲"
                selected={method === 'transferencia'}
                onClick={() => setMethod('transferencia')}
              >
                Transferencia
              </Chip>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((option) => (
              <Chip
                key={option.value}
                emoji={option.emoji}
                selected={activeChannel === option.value}
                onClick={() => setChannel(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          {totals.total > 0n && method === 'efectivo' && (
            <div>
              <p className="pb-2 text-sm text-ink-muted">¿Quién cobró?</p>
              <div className="flex flex-wrap gap-2">
                {profiles.data
                  ?.filter((p) => p.activo)
                  .sort((x, y) => Number(y.id === profile?.id) - Number(x.id === profile?.id))
                  .map((p) => (
                    <Chip
                      key={p.id}
                      emoji={p.emoji}
                      selected={(collector ?? profile?.id) === p.id}
                      onClick={() => setCollector(p.id)}
                    >
                      {p.id === profile?.id ? 'Yo' : p.display_name}
                    </Chip>
                  ))}
              </div>
            </div>
          )}

          {method === 'efectivo' && totals.total > 0n && (
            <ChangeCalculator key={totals.total.toString()} total={totals.total} />
          )}
          {isContador && cart.length > 0 && (
            <CostNote cart={cart} products={products} total={totals.total} />
          )}
          <p className="text-ink-muted">{describeVenta(totals, method)}</p>
          <Button
            size="lg"
            block
            className="min-h-16 text-xl"
            disabled={cart.length === 0}
            onClick={charge}
          >
            {totals.total > 0n ? `Cobrar ${money(totals.total)}` : 'Registrar regalo'}
          </Button>
        </div>
      </BottomSheet>

      {/* Compra, regalo, merma y conteo */}
      <BottomSheet
        open={tool !== null}
        onOpenChange={(open) => !open && setTool(null)}
        title={
          tool === 'compra'
            ? '📦 Entró merch'
            : tool === 'regalo'
              ? '🎁 Regalé merch'
              : tool === 'merma'
                ? '🗑️ Se dañó o se perdió'
                : tool === 'fotos'
                  ? '📷 Fotos de productos'
                  : '🔢 Conté el merch'
        }
      >
        {tool === 'compra' && <CompraFlow products={products} onDone={() => setTool(null)} />}
        {(tool === 'regalo' || tool === 'merma') && (
          <SalidaFlow kind={tool} products={products} onDone={() => setTool(null)} />
        )}
        {tool === 'fotos' && <PhotosTool products={products} />}
        {tool === 'conteo' && <ConteoFlow products={products} onDone={() => setTool(null)} />}
      </BottomSheet>

      {/* Éxito: listo para la siguiente venta en menos de un segundo */}
      {done && (
        <div
          role="status"
          aria-label="Venta registrada"
          className={cx(
            'pointer-events-none fixed inset-0 z-[70] grid animate-fade-in place-items-center bg-bg/85',
          )}
        >
          <p className="display text-7xl text-in">✓ {done}</p>
        </div>
      )}
    </Page>
  )
}
