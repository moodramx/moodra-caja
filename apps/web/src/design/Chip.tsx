import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  emoji?: string
  selected?: boolean
}

/** Chip seleccionable con emoji (categorías, opciones de pago). */
export function Chip({ emoji, selected = false, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-base font-medium',
        'transition-colors duration-100 select-none',
        selected
          ? 'border-ink bg-ink text-bg'
          : 'border-line bg-surface text-ink active:bg-surface-2',
        className,
      )}
      {...props}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {children}
    </button>
  )
}
