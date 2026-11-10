import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { registerSW } from 'virtual:pwa-register'
import { ToastProvider } from './design/Toast'
import { AuthProvider } from './lib/auth'
import { db } from './lib/offline/db'
import { routeTree } from './routeTree.gen'
import './index.css'

const WEEK = 7 * 24 * 60 * 60_000

// offlineFirst: sin señal se usa lo guardado y no se queda "cargando".
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: WEEK, retry: 1, networkMode: 'offlineFirst' },
  },
})

// La caché de lecturas vive en IndexedDB (Dexie) para abrir la app sin red.
const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await db.kv.get(key))?.value ?? null,
    setItem: async (key, value) => void (await db.kv.put({ key, value })),
    removeItem: async (key) => void (await db.kv.delete(key)),
  },
  key: 'query-cache',
})

const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}
      // La copia guardada es solo un respaldo para cuando no hay señal: al abrir
      // la app siempre se vuelve a pedir todo al servidor.
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
