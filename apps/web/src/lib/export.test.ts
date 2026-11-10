import { describe, expect, it } from 'vitest'
import { cellText, fileName, sheetNames } from './export'
import type { Report } from './reports'

const report = (title: string): Report => ({ title, subtitle: '', columns: [], rows: [] })

describe('exportación', () => {
  it('celdas: dinero con formato, números tal cual, vacío si no hay', () => {
    expect(cellText(123456n)).toBe('$1,234.56')
    expect(cellText(-5000n)).toBe('-$50.00')
    expect(cellText(12)).toBe('12')
    expect(cellText('71.4 %')).toBe('71.4 %')
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })

  it('nombres de hoja válidos para Excel: sin símbolos prohibidos, máximo 31 y sin repetir', () => {
    const names = sheetNames([
      report('Auxiliar · 1.2.01 Cuenta Moodra: principal / banco'),
      report('Balance general'),
      report('Balance general'),
    ])
    expect(names[0]).toBe('Auxiliar · 1.2.01 Cuenta Moodra')
    expect(names[0]!.length).toBeLessThanOrEqual(31)
    expect(names.slice(1)).toEqual(['Balance general', 'Balance general 2'])
  })

  it('nombre de archivo sin acentos ni espacios', () => {
    expect(fileName('Estado de resultados noviembre 2026')).toBe(
      'moodra-estado-de-resultados-noviembre-2026',
    )
    expect(fileName('Balanza de comprobación · año 2026')).toBe(
      'moodra-balanza-de-comprobacion-ano-2026',
    )
  })
})
