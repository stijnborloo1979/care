import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'

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

      // Een bestaand abonnement hergebruiken mag alleen als het nog bij
      // dezelfde VAPID-sleutel hoort.
      //
      // Dat was hier fout, en op een vervelende manier: veranderen de
      // sleutels — bij het opzetten, of ooit bij het vernieuwen — dan blijft
      // de browser een abonnement bewaren dat op de oude sleutel getekend is.
      // De pushdienst weigert dat, maar niet met "bestaat niet", dus het
      // wordt ook nooit opgeruimd. De schakelaar staat dan op aan, de
      // database heeft een rij, en er komt nooit iets binnen. Uit en weer
      // aan zetten hielp niet, want dan pakte hij datzelfde abonnement er
      // weer bij.
      if (bestaand && !zelfdeSleutel(bestaand)) {
        await supabase.rpc('delete_push_subscription', { ep: bestaand.endpoint })
        await bestaand.unsubscribe()
      }

      const bruikbaar = bestaand && zelfdeSleutel(bestaand) ? bestaand : null
      const sub =
        bruikbaar ??
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
      setFout(tt('Meldingen aanzetten lukte niet. Probeer het later opnieuw.'))
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
      setFout(tt('Meldingen uitzetten lukte niet.'))
    }
  }, [])

  return { status, fout, aanzetten, uitzetten }
}

/**
 * Hoort dit abonnement nog bij de sleutel die we nu gebruiken?
 *
 * De browser bewaart de sleutel waarmee hij het abonnement maakte. Komt die
 * niet overeen, dan kan er nooit iets aankomen — hoe vaak je de schakelaar
 * ook omzet.
 */
function zelfdeSleutel(sub: PushSubscription): boolean {
  try {
    const opties = sub.options?.applicationServerKey
    if (!opties) return false
    const nu = new Uint8Array(naarBytes(SLEUTEL!))
    const had = new Uint8Array(opties as ArrayBuffer)
    if (had.byteLength !== nu.byteLength) return false
    return had.every((b, i) => b === nu[i])
  } catch {
    // Kan de browser het niet zeggen, dan liever opnieuw inschrijven dan
    // blijven gokken.
    return false
  }
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
