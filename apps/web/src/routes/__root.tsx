import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-4xl">🫥</p>
        <p className="mt-3 text-lg font-semibold">Esta página no existe</p>
        <a href="/" className="mt-4 inline-flex min-h-12 items-center underline underline-offset-4">
          Volver al inicio
        </a>
      </div>
    </main>
  ),
})
