import { useEffect } from 'react'

/**
 * Houdt het scherm aan, voor een tablet die altijd in de lader staat.
 * Zonder dit gaat het scherm na een tijdje uit, en is een lichtsignaal
 * nutteloos. De browser laat het vergrendelen los wanneer de app naar de
 * achtergrond gaat; daarom vragen we het opnieuw als ze terugkomt.
 */
export function useWakeLock(aan: boolean) {
  useEffect(() => {
    if (!aan || !('wakeLock' in navigator)) return
    let slot: { release: () => Promise<void> } | null = null
    let gestopt = false

    async function vraag() {
      try {
        slot = await (navigator as unknown as {
          wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> }
        }).wakeLock.request('screen')
      } catch {
        // Geweigerd, bijvoorbeeld bij een lage batterij. Niet erg.
      }
    }

    function zichtbaar() {
      if (!gestopt && document.visibilityState === 'visible') vraag()
    }

    vraag()
    document.addEventListener('visibilitychange', zichtbaar)
    return () => {
      gestopt = true
      document.removeEventListener('visibilitychange', zichtbaar)
      slot?.release().catch(() => {})
    }
  }, [aan])
}
