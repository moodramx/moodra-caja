import { describe, expect, it } from 'vitest'
import {
  applyKey,
  centsToDecimalString,
  entryToCents,
  formatEntry,
  formatMXN,
  formatMXNShort,
  type KeypadKey,
} from './money'

const type = (keys: string) =>
  [...keys].reduce((entry, k) => applyKey(entry, (k === '<' ? 'back' : k) as KeypadKey), '')

describe('formatMXN', () => {
  it('formatea centavos como pesos mexicanos', () => {
    expect(formatMXN(123456n)).toBe('$1,234.56')
    expect(formatMXN(0n)).toBe('$0.00')
    expect(formatMXN(5n)).toBe('$0.05')
    expect(formatMXN(85000n)).toBe('$850.00')
  })

  it('formatea negativos', () => {
    expect(formatMXN(-38000n)).toBe('-$380.00')
    expect(centsToDecimalString(-5n)).toBe('-0.05')
  })

  it('no pierde precisión con montos enormes (sin floats)', () => {
    expect(formatMXN(900719925474099312n)).toBe('$9,007,199,254,740,993.12')
  })

  it('versión corta quita los .00', () => {
    expect(formatMXNShort(125000n)).toBe('$1,250')
    expect(formatMXNShort(125050n)).toBe('$1,250.50')
  })
})

describe('teclado de monto', () => {
  it('teclea pesos enteros', () => {
    expect(type('850')).toBe('850')
    expect(entryToCents(type('850'))).toBe(85000n)
  })

  it('acepta máximo dos decimales y un solo punto', () => {
    expect(type('12.345')).toBe('12.34')
    expect(type('12..5')).toBe('12.5')
    expect(entryToCents('12.5')).toBe(1250n)
    expect(entryToCents('12.05')).toBe(1205n)
  })

  it('punto inicial se vuelve "0."', () => {
    expect(type('.5')).toBe('0.5')
    expect(entryToCents('0.5')).toBe(50n)
  })

  it('no deja ceros a la izquierda', () => {
    expect(type('007')).toBe('7')
    expect(type('0')).toBe('0')
  })

  it('borra con retroceso', () => {
    expect(type('850<')).toBe('85')
    expect(type('8.<<')).toBe('')
    expect(type('<')).toBe('')
  })

  it('limita los dígitos enteros', () => {
    expect(type('123456789')).toBe('1234567')
    expect(type('1234567.89')).toBe('1234567.89')
  })

  it('entrada vacía vale cero', () => {
    expect(entryToCents('')).toBe(0n)
    expect(entryToCents('5.')).toBe(500n)
  })

  it('rechaza basura', () => {
    expect(() => entryToCents('1e3')).toThrow()
    expect(() => entryToCents('-5')).toThrow()
  })

  it('pinta lo tecleado con separadores', () => {
    expect(formatEntry('')).toBe('$0')
    expect(formatEntry('1850')).toBe('$1,850')
    expect(formatEntry('1850.')).toBe('$1,850.')
    expect(formatEntry('1850.5')).toBe('$1,850.5')
  })
})
