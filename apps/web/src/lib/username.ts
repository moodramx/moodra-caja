// El usuario solo escribe su username; Supabase Auth usa un email interno.
export const EMAIL_DOMAIN = 'caja.moodra.mx'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,23}$/

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(normalizeUsername(input))
}

/** "Pepe " → "pepe@caja.moodra.mx". Lanza si el username no es válido. */
export function usernameToEmail(input: string): string {
  const username = normalizeUsername(input)
  if (!USERNAME_RE.test(username)) throw new Error('Usuario inválido')
  return `${username}@${EMAIL_DOMAIN}`
}
