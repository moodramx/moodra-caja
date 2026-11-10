import type {
  CompraPayload,
  EntregaPayload,
  GastoPayload,
  IngresoPayload,
  PuseDineroPayload,
  RegresoPayload,
  VentaPayload,
} from '../events'
import { cartTotals } from '../merch'
import type { OutboxOp } from './db'

export interface PendingEffects {
  /** Cambio en el efectivo de la banda que trae el usuario. */
  cash: bigint
  /** Cambio en lo que la banda le debe al usuario. */
  owed: bigint
}

/**
 * UI optimista: cómo cambian los saldos del usuario con lo que capturó y aún
 * no llega al servidor. Refleja las mismas reglas que el posteo (PRD §5.3).
 */
export function pendingEffects(
  ops: OutboxOp[],
  userId: string,
  isContador = false,
): PendingEffects {
  let cash = 0n
  let owed = 0n

  for (const op of ops) {
    if (op.kind !== 'submit' || op.state !== 'pending' || op.user_id !== userId || !op.payload)
      continue
    const amount = 'amount_cents' in op.payload ? BigInt(op.payload.amount_cents) : 0n

    switch (op.type) {
      case 'gasto': {
        const p = op.payload as GastoPayload
        if (p.paid_with === 'efectivo_banda') cash -= amount
        if (p.paid_with === 'mi_dinero' && p.settlement_pref !== 'aportacion') owed += amount
        break
      }
      case 'ingreso': {
        const p = op.payload as IngresoPayload
        if (p.destination === 'efectivo_integrante') cash += amount
        break
      }
      case 'puse_dinero': {
        const p = op.payload as PuseDineroPayload
        if (p.kind === 'prestamo') owed += amount
        if (p.destination === 'efectivo_integrante' && (p.holder_member_id ?? userId) === userId) {
          cash += amount
        }
        break
      }
      case 'regreso_dinero': {
        const p = op.payload as RegresoPayload
        if (p.member_id === userId) owed -= amount
        if (p.origin === 'efectivo_integrante') cash -= amount
        break
      }
      case 'entrega_efectivo': {
        // Entre personas no cuenta hasta que el otro confirma. A caja o banco
        // cuenta de inmediato solo si la captura el contador.
        const p = op.payload as EntregaPayload
        if (
          isContador &&
          p.to_kind !== 'integrante' &&
          (p.from_kind ?? 'integrante') === 'integrante'
        ) {
          cash -= amount
        }
        break
      }
      case 'venta_merch': {
        // El efectivo de la venta queda en manos de quien cobró.
        const p = op.payload as VentaPayload
        if (p.payment_method === 'efectivo' && (p.collected_by ?? userId) === userId) {
          cash += cartTotals(p.lines).total
        }
        break
      }
      case 'compra_merch': {
        const p = op.payload as CompraPayload
        const total = p.lines.reduce(
          (sum, l) => sum + BigInt(l.unit_cost_cents) * BigInt(l.qty),
          0n,
        )
        if (p.paid_with === 'efectivo_banda') cash -= total
        if (p.paid_with === 'mi_dinero' && p.settlement_pref !== 'aportacion') owed += total
        break
      }
    }
  }
  return { cash, owed }
}
