import { applyKey, formatEntry, type KeypadKey } from '../lib/money'
import { cx } from './cx'

interface AmountKeypadProps {
  /** Lo tecleado en pesos ("850.5"). Convierte a centavos con entryToCents. */
  value: string
  onChange: (value: string) => void
  label?: string
}

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

/** Teclado numérico propio para montos: cifra enorme y teclas de 64 px. */
export function AmountKeypad({ value, onChange, label = 'Monto' }: AmountKeypadProps) {
  const press = (key: KeypadKey) => {
    const next = applyKey(value, key)
    if (next !== value) {
      navigator.vibrate?.(8)
      onChange(next)
    }
  }

  return (
    <div>
      <output
        aria-label={label}
        className={cx(
          'block truncate py-4 text-center font-display text-6xl font-semibold tabular-nums',
          value === '' && 'text-ink-faint',
        )}
      >
        {formatEntry(value)}
      </output>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={key === 'back' ? 'Borrar' : key === '.' ? 'Punto decimal' : key}
            onClick={() => press(key)}
            className="grid min-h-16 place-items-center rounded-control bg-surface-2 text-2xl font-medium tabular-nums transition-colors duration-75 select-none active:bg-line"
          >
            {key === 'back' ? <span aria-hidden="true">⌫</span> : key}
          </button>
        ))}
      </div>
    </div>
  )
}
