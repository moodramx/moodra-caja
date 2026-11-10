import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-bg active:bg-accent',
  secondary: 'bg-surface-2 text-ink border border-line active:bg-line',
  ghost: 'bg-transparent text-ink active:bg-surface-2',
  danger: 'bg-surface-2 text-danger border border-line active:bg-line',
}

const sizes: Record<Size, string> = {
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-14 px-6 text-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
        'transition-[background-color,transform] duration-100 select-none active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
