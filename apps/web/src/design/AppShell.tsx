import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

const NAV = [
  {
    to: '/',
    label: 'Inicio',
    icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  },
  { to: '/movimientos', label: 'Movimientos', icon: 'M4 6h16M4 12h16M4 18h10' },
  {
    to: '/merch',
    label: 'Merch',
    icon: 'M8 4 3 7l2 4 2-1v10h10V10l2 1 2-4-5-3a4 4 0 0 1-8 0z',
  },
  {
    to: '/transporte',
    label: 'Transporte',
    icon: 'M4 16v-3l2-5h12l2 5v3M4 16h16M7 16v2.5M17 16v2.5M7.5 13h.01M16.5 13h.01',
  },
  { to: '/reportes', label: 'Reportes', icon: 'M5 20V10m7 10V4m7 16v-7' },
  { to: '/mas', label: 'Más', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
] as const

/** Layout móvil: contenido con scroll y navegación inferior fija. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between px-4 pt-safe">
        <p className="flex items-end gap-2 pt-4">
          <img
            src="/moodra-logo.webp"
            alt="Moodra"
            width="480"
            height="293"
            className="h-9 w-auto"
          />
          <span className="label-mono pb-0.5 text-sm text-accent">$$</span>
        </p>
      </header>
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</main>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-safe backdrop-blur"
      >
        {/* Cada pestaña toma el ancho de su texto ("Movimientos" necesita más que "Más");
            con seis casillas iguales no cabían en celulares de 360 px. */}
        <ul className="mx-auto flex max-w-md">
          {NAV.map((item) => (
            <li key={item.to} className="min-w-12 flex-auto">
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] whitespace-nowrap tracking-tight text-ink-muted aria-[current=page]:font-semibold aria-[current=page]:text-ink"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
