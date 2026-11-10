// Dinero: SIEMPRE centavos enteros en bigint. Nunca floats.

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const grouping = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

/** Máximo de dígitos enteros que acepta el teclado ($9,999,999.99). */
export const MAX_INTEGER_DIGITS = 7

/** Centavos → cadena decimal exacta, p. ej. 123456n → "1234.56". */
export function centsToDecimalString(cents: bigint): `${number}` {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const pesos = abs / 100n
  const rest = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${pesos}.${rest}` as `${number}`
}

/** Formatea centavos como "$1,234.56". Pasa por cadena decimal, no por float. */
export function formatMXN(cents: bigint): string {
  return mxn.format(centsToDecimalString(cents))
}

/** Como formatMXN, pero sin ".00" cuando el monto es cerrado: "$1,250". */
export function formatMXNShort(cents: bigint): string {
  const full = formatMXN(cents)
  return full.endsWith('.00') ? full.slice(0, -3) : full
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back'

/**
 * Estado del teclado de monto: lo que el usuario ha tecleado en pesos,
 * p. ej. "", "8", "850", "850.", "850.5". Devuelve la nueva entrada.
 */
export function applyKey(entry: string, key: KeypadKey): string {
  if (key === 'back') return entry.slice(0, -1)

  const [integer = '', decimals] = entry.split('.')
  const hasDot = entry.includes('.')

  if (key === '.') {
    if (hasDot) return entry
    return entry === '' ? '0.' : `${entry}.`
  }
  if (hasDot) {
    return (decimals ?? '').length >= 2 ? entry : entry + key
  }
  if (integer === '0') return key // sin ceros a la izquierda
  if (integer.length >= MAX_INTEGER_DIGITS) return entry
  return entry + key
}

/** Entrada del teclado → centavos. "850.5" → 85050n; "" → 0n. */
export function entryToCents(entry: string): bigint {
  if (!/^\d*(\.\d{0,2})?$/.test(entry)) throw new Error(`Monto inválido: "${entry}"`)
  const [integer = '', decimals = ''] = entry.split('.')
  return BigInt(integer || '0') * 100n + BigInt(decimals.padEnd(2, '0') || '0')
}

/** Lo que se pinta mientras se teclea: "$1,850.5" (respeta lo tecleado). */
export function formatEntry(entry: string): string {
  const [integer = '', decimals] = entry.split('.')
  const pesos = grouping.format(BigInt(integer || '0'))
  return entry.includes('.') ? `$${pesos}.${decimals ?? ''}` : `$${pesos}`
}
