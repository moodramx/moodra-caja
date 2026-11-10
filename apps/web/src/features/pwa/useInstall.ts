import { useCallback, useEffect, useState } from 'react'

// Chrome/Android disparan `beforeinstallprompt`; iOS no tiene API y hay que
// guiar al usuario a "Agregar a inicio" desde Safari.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform = 'installed' | 'prompt' | 'ios' | 'manual'

export function detectIOS(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS se reporta como "Macintosh" con pantalla táctil.
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// El evento puede llegar antes de que monte React: se captura a nivel módulo.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    listeners.forEach((notify) => notify())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((notify) => notify())
  })
}

export function useInstall() {
  const [, rerender] = useState(0)

  useEffect(() => {
    const notify = () => rerender((n) => n + 1)
    listeners.add(notify)
    return () => {
      listeners.delete(notify)
    }
  }, [])

  const platform: InstallPlatform = isStandalone()
    ? 'installed'
    : deferredPrompt
      ? 'prompt'
      : detectIOS(navigator.userAgent, navigator.maxTouchPoints)
        ? 'ios'
        : 'manual'

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    rerender((n) => n + 1)
    return outcome === 'accepted'
  }, [])

  return { platform, promptInstall }
}
