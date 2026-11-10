import type { ReactNode } from 'react'

interface PageProps {
  /** Número editorial de la sección: "01", "02"… */
  number: string
  title: string
  children: ReactNode
}

/** Encabezado editorial numerado, como en moodra.mx: "01 — Inicio". */
export function Page({ number, title, children }: PageProps) {
  return (
    <div className="space-y-5 px-4 pt-6 pb-8">
      <h1 className="label-mono text-ink-muted">
        <span className="tabular-nums">{number}</span> — {title}
      </h1>
      {children}
    </div>
  )
}

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint: string }) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
      <p aria-hidden="true" className="text-4xl">
        {emoji}
      </p>
      <p className="mt-3 text-lg font-semibold">{title}</p>
      <p className="mt-1 text-ink-muted">{hint}</p>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-line bg-surface p-4 ${className}`}>
      {children}
    </section>
  )
}
