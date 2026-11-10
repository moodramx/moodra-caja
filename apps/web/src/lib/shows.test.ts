import { describe, expect, it } from 'vitest'
import { breakEvenTickets, commissionFor, shareOf, showsForSale } from './shows'

describe('cálculos de shows (mismos números que pgTAP)', () => {
  it('parte de la taquilla', () => {
    expect(shareOf(2_000_000n, 70)).toBe(1_400_000n) // 100 boletos × $200 × 70 %
    expect(shareOf(1_500_000n, 70)).toBe(1_050_000n)
    expect(shareOf(1_000_001n, 33.33)).toBe(333_300n)
    expect(shareOf(0n, 70)).toBe(0n)
  })

  it('comisión de la boletera: porcentaje más fijo por boleto', () => {
    expect(commissionFor(1_500_000n, 60, 10, 500n)).toBe(180_000n)
    expect(commissionFor(1_500_000n, 60, 0, 0n)).toBe(0n)
    expect(commissionFor(2_000_000n, 80, 10, 500n)).toBe(240_000n)
  })

  it('boletos para no perder', () => {
    expect(breakEvenTickets(500_000n, 20_000n)).toBe(25)
    expect(breakEvenTickets(510_000n, 20_000n)).toBe(26)
    expect(breakEvenTickets(0n, 20_000n)).toBe(0)
    expect(breakEvenTickets(500_000n, 0n)).toBeNull()
  })
})

describe('shows que se ofrecen al cobrar merch', () => {
  const today = new Date('2026-11-14T20:00:00-06:00')
  const show = (id: string, date: string, status = 'programado') => ({ id, date, status })
  const all = [
    show('hoy', '2026-11-14'),
    show('ayer', '2026-11-13', 'cerrado'),
    show('en-3', '2026-11-17'),
    show('en-10', '2026-11-24'),
    show('viejo', '2026-09-01', 'cerrado'),
    show('cancelado', '2026-11-14', 'cancelado'),
  ]

  it('lista los de estos días, sin cancelados, sin importar cuántos haya', () => {
    expect(showsForSale(all, null, today).map((s) => s.id)).toEqual(['hoy', 'ayer', 'en-3'])
    const muchos = Array.from({ length: 40 }, (_, i) => show(`s${i}`, '2026-11-14'))
    expect(showsForSale(muchos, null, today)).toHaveLength(40)
  })

  it('siempre incluye el ya elegido, aunque sea de otra fecha', () => {
    expect(showsForSale(all, 'en-10', today).map((s) => s.id)).toEqual([
      'en-10',
      'hoy',
      'ayer',
      'en-3',
    ])
  })

  it('si no hay ninguno cerca, ofrece los más recientes', () => {
    const lejanos = [show('a', '2026-08-01'), show('b', '2026-10-01'), show('c', '2026-12-25')]
    expect(showsForSale(lejanos, null, today).map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })
})
