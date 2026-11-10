import { describe, expect, it } from 'vitest'
import {
  carCost,
  kmToMeters,
  kmplToHundredths,
  metersToKm,
  previewTrip,
  settleUp,
  splitEvenly,
  suggestedTrafficPct,
  type CarInput,
} from './transport'

const car1: CarInput = {
  vehicleId: 'car1',
  ownerId: 'a',
  kmPerLiter: 12,
  pricePerLiterCents: 2400,
  tollCents: 10000,
  tollPaidBy: 'c',
}
const car2: CarInput = {
  vehicleId: 'car2',
  ownerId: 'b',
  kmPerLiter: '15.00',
  pricePerLiterCents: 2700,
  tollCents: 0,
  tollPaidBy: null,
}

// Mismos números que supabase/tests/050_transporte.test.sql.
describe('costo de un viaje', () => {
  const trip = { distanceM: 30000, roundTrip: true, trafficPct: 0, wearCentsPerKm: 150 }

  it('gasolina = km ÷ rendimiento × precio; desgaste por km; casetas', () => {
    expect(carCost(trip, car1)).toEqual({
      vehicleId: 'car1',
      fuel: 12000n,
      wear: 9000n,
      toll: 10000n,
      total: 31000n,
    })
    expect(carCost(trip, car2)).toMatchObject({ fuel: 10800n, wear: 9000n, total: 19800n })
  })

  it('solo ida, con tráfico y redondeo al centavo', () => {
    const cost = carCost(
      { distanceM: 10001, roundTrip: false, trafficPct: 10, wearCentsPerKm: 150 },
      { ...car1, tollCents: 0 },
    )
    expect(cost).toMatchObject({ fuel: 2200n, wear: 1500n, total: 3700n })
  })

  it('rendimiento con decimales sin floats', () => {
    expect(kmplToHundredths('12.5')).toBe(1250n)
    expect(kmplToHundredths(9)).toBe(900n)
    expect(kmplToHundredths('10.257')).toBe(1025n)
  })
})

describe('reparto', () => {
  it('partes iguales; el centavo que sobra va al primero por id', () => {
    expect([...splitEvenly(3700n, ['c', 'a', 'b'])]).toEqual([
      ['a', 1234n],
      ['b', 1233n],
      ['c', 1233n],
    ])
    expect([...splitEvenly(50800n, ['a', 'b', 'c', 'd']).values()]).toEqual([
      12700n,
      12700n,
      12700n,
      12700n,
    ])
    expect(splitEvenly(100n, []).size).toBe(0)
  })

  it('vista previa: lo que puso cada quien contra lo que le toca', () => {
    const preview = previewTrip({
      distanceM: 30000,
      roundTrip: true,
      trafficPct: 0,
      wearCentsPerKm: 150,
      cars: [car1, car2],
      sharers: ['a', 'b', 'c', 'd'],
    })
    expect(preview.total).toBe(50800n)
    expect(Object.fromEntries(preview.net)).toEqual({ a: -8300n, b: -7100n, c: 2700n, d: 12700n })
    expect([...preview.net.values()].reduce((s, v) => s + v, 0n)).toBe(0n)
  })

  it('quien puso auto pero no entra al reparto también cobra', () => {
    const preview = previewTrip({
      distanceM: 30000,
      roundTrip: true,
      trafficPct: 0,
      wearCentsPerKm: 150,
      cars: [car2],
      sharers: ['a', 'c'],
    })
    expect(Object.fromEntries(preview.net)).toEqual({ a: 9900n, c: 9900n, b: -19800n })
  })
})

describe('quién le paga a quién', () => {
  it('el menor número de pagos', () => {
    const transfers = settleUp([
      { id: 'a', cents: -8300n },
      { id: 'b', cents: -7100n },
      { id: 'c', cents: 2700n },
      { id: 'd', cents: 12700n },
    ])
    expect(transfers).toEqual([
      { from: 'd', to: 'a', cents: 8300n },
      { from: 'd', to: 'b', cents: 4400n },
      { from: 'c', to: 'b', cents: 2700n },
    ])
  })
  it('a mano: nada que pagar', () => {
    expect(
      settleUp([
        { id: 'a', cents: 0n },
        { id: 'b', cents: 0n },
      ]),
    ).toEqual([])
  })
})

describe('entradas', () => {
  it('kilómetros a metros', () => {
    expect(kmToMeters('42.5')).toBe(42500)
    expect(kmToMeters('30')).toBe(30000)
    expect(kmToMeters('10,001')).toBe(10001)
    expect(kmToMeters('0')).toBeNull()
    expect(kmToMeters('abc')).toBeNull()
    expect(metersToKm(42500)).toBe('42.5')
  })
  it('ajuste por tráfico sugerido', () => {
    expect(suggestedTrafficPct(3600, 2400)).toBe(25)
    expect(suggestedTrafficPct(9000, 2400)).toBe(30)
    expect(suggestedTrafficPct(2000, 2400)).toBe(0)
    expect(suggestedTrafficPct(null, 2400)).toBe(0)
  })
})
