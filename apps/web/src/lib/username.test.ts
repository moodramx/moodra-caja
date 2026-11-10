import { describe, expect, it } from 'vitest'
import { isValidUsername, usernameToEmail } from './username'

describe('username → email interno', () => {
  it('mapea al dominio de la caja', () => {
    expect(usernameToEmail('diego')).toBe('diego@caja.moodra.mx')
  })

  it('normaliza mayúsculas y espacios (teclado del celular)', () => {
    expect(usernameToEmail('  Pepe ')).toBe('pepe@caja.moodra.mx')
  })

  it('rechaza usernames inválidos', () => {
    expect(isValidUsername('a')).toBe(false)
    expect(isValidUsername('con espacio')).toBe(false)
    expect(isValidUsername('alguien@otro.com')).toBe(false)
    expect(isValidUsername('.punto')).toBe(false)
    expect(() => usernameToEmail('alguien@otro.com')).toThrow()
  })

  it('acepta puntos, guiones y números', () => {
    expect(isValidUsername('uli.g-2')).toBe(true)
  })
})
