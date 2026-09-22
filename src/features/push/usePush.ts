import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export type PushStatus = 'laden' | 'aan' | 'uit' | 'geweigerd' | 'onbeschikbaar'

const SLEUTEL = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function beschikbaar(): boolean {
  return (
    !!SLEUTEL &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Meldingen op dit toestel. Per browser, niet per persoon: wie een gsm en
 * een laptop gebruikt, zet het twee keer aan.
 *
 * Op iPhone en iPad werkt dit alleen als de app op het beginscherm staat.
 * In Safari als tabblad bestaat PushManager niet, en dan zegt deze hook
 * meteen dat het niet kan.
 */
export function usePush(householdId: string) {
  const [status, setStatus] = useState<PushStatus>('laden')
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    async function kijk() {
      if (!beschikbaar()) return zet('onbeschikbaar')
      if (Notification.permission === 'denied') return zet('geweigerd')
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        zet(sub ? 'aan' : 'uit')
      } catch {
        zet('onbeschikbaar')
      }
    }
    function zet(s: PushStatus) {
      if (!weg) setStatus(s)
    }
    kijk()
    return () => {
      weg = true
    }
  }, [])

  const aanzetten = useCallback(async () => {
    setFout(null)
    try {
      const toestemming = await Notification.requestPermission()
      if (toestemming !== 'granted') {
        setStatus(toestemming === 'denied' ? 'geweigerd' : 'uit')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const bestaand = await reg.pushManager.getSubscription()
      const sub =
        bestaand ??
        (await reg.pushManager.subscribe({
          // Verplicht: elke push leidt tot een zichtbare melding. Stille
          // pushberichten laten browsers niet toe, en terecht.
          userVisibleOnly: true,
          applicationServerKey: naarBytes(SLEUTEL!),
        }))

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
      if (!json.endpoint || !json.keys) throw new Error('onvolledig abonnement')

      const { error } = await supabase.rpc('save_push_subscription', {
        hh: householdId,
        ep: json.endpoint,
        p256: json.keys.p256dh,
        auth_secret: json.keys.auth,
        agent: navigator.userAgent.slice(0, 200),
      })
      if (error) throw error

      setStatus('aan')
    } catch {
      setFout('Meldingen aanzetten lukte niet. Probeer het later opnieuw.')
      setStatus('uit')
    }
  }, [householdId])

  const uitzetten = useCallback(async () => {
    setFout(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // Eerst de server, dan de browser: anders is het endpoint al weg
        // en blijft de rij achter.
        await supabase.rpc('delete_push_subscription', { ep: sub.endpoint })
        await sub.unsubscribe()
      }
      setStatus('uit')
    } catch {
      setFout('Meldingen uitzetten lukte niet.')
    }
  }, [])

  return { status, fout, aanzetten, uitzetten }
}

/** De VAPID-sleutel komt als base64url en moet als bytes naar de browser. */
function naarBytes(sleutel: string): ArrayBuffer {
  const pad = '='.repeat((4 - (sleutel.length % 4)) % 4)
  const base64 = (sleutel + pad).replace(/-/g, '+').replace(/_/g, '/')
  const ruw = atob(base64)
  const buffer = new ArrayBuffer(ruw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < ruw.length; i++) bytes[i] = ruw.charCodeAt(i)
  return buffer
}
