import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Platform = 'android' | 'ios' | 'desktop' | 'onbekend'

export function platformVan(): Platform {
  const ua = navigator.userAgent
  // iPadOS doet zich voor als Mac; de aanraakpunten verraden het toestel.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows|Mac|Linux/.test(ua)) return 'desktop'
  return 'onbekend'
}

export function staatOpBeginscherm() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari gebruikt hier zijn eigen vlag.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Chrome en Edge geven een event waarmee je zelf een installatieknop kan
 * tonen. Safari doet dat niet: daar blijft het handwerk via Deel → Zet op
 * beginscherm, en het enige wat de app kan doen is uitleggen hoe.
 */
export function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [geinstalleerd, setGeinstalleerd] = useState(staatOpBeginscherm())

  useEffect(() => {
    function vangOp(e: Event) {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    function gedaan() {
      setEvent(null)
      setGeinstalleerd(true)
    }

    window.addEventListener('beforeinstallprompt', vangOp)
    window.addEventListener('appinstalled', gedaan)
    return () => {
      window.removeEventListener('beforeinstallprompt', vangOp)
      window.removeEventListener('appinstalled', gedaan)
    }
  }, [])

  async function installeer() {
    if (!event) return false
    await event.prompt()
    const keuze = await event.userChoice
    setEvent(null)
    return keuze.outcome === 'accepted'
  }

  return {
    kanInstalleren: !!event,
    installeer,
    geinstalleerd,
    platform: platformVan(),
  }
}

const WEGGEKLIKT = 'thuis.install.weg'

export function isWeggeklikt() {
  try {
    return localStorage.getItem(WEGGEKLIKT) === '1'
  } catch {
    return false
  }
}

export function onthoudWeggeklikt() {
  try {
    localStorage.setItem(WEGGEKLIKT, '1')
  } catch {
    // Opslag geweigerd: dan verschijnt de balk gewoon opnieuw.
  }
}
