// Instancia única del motor de sync + los disparadores (PRD §8): al abrir la
// app, al recuperar red, al volver a primer plano y cada 30 s si hay pendientes.
import { useEffect, useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { pingNotify } from '../push'
import { supabaseBackend } from './backend'
import { db, type OutboxOp } from './db'
import { SyncEngine } from './sync'

const listeners = new Set<() => void>()

export const engine = new SyncEngine(db, supabaseBackend, () => listeners.forEach((fn) => fn()))

/** Operaciones del usuario en el outbox (pendientes y rechazadas), en orden. */
export function useOutbox(userId: string | undefined): OutboxOp[] {
  const [ops, setOps] = useState<OutboxOp[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = () =>
      void db.outbox
        .orderBy('created_at')
        .toArray()
        .then((all) => {
          if (!cancelled) setOps(all.filter((op) => op.user_id === userId))
        })
    load()
    listeners.add(load)
    return () => {
      cancelled = true
      listeners.delete(load)
    }
  }, [userId])

  return userId ? ops : []
}

/** Arranca los disparadores de sync para el usuario. Devuelve cómo apagarlos. */
export function startSync(userId: string, queryClient: QueryClient): () => void {
  // Cuando algo llega al servidor, se refrescan las lecturas.
  // …y se le avisa al servidor para que mande las notificaciones que toquen.
  engine.onSynced = () => {
    void queryClient.invalidateQueries()
    pingNotify()
  }

  const run = () => void engine.sync(userId)
  const force = () => void engine.sync(userId, { force: true })
  const onVisible = () => document.visibilityState === 'visible' && force()

  window.addEventListener('online', force)
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(run, 30_000)
  force()

  return () => {
    engine.onSynced = () => {}
    window.removeEventListener('online', force)
    document.removeEventListener('visibilitychange', onVisible)
    clearInterval(interval)
  }
}
