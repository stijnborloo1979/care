import { useEffect } from 'react'
import { useLicht, type Signaal } from './lichtStore'

/**
 * De ledbalk van een Philips-signagescherm (getest op de 10BDL4551T) als
 * tweede uitgang voor het licht, naast de gloed op het scherm.
 *
 * Een webpagina mag zelf geen verbinding met de leds maken. Daarvoor draait
 * op het scherm het hulpappje "LifeAngle Ledbalk" (android/ledbalk), dat op
 * 127.0.0.1:8765 luistert en de leds via Philips SICP aanstuurt.
 *
 * Niets in te stellen: staat het hulpappje er, dan wordt het gevonden.
 * Staat het er niet, dan gebeurt er niets en blijft alleen de gloed.
 */
const ADRES = 'http://127.0.0.1:8765'

/** Per signaal een kleur en of het knippert. Uit zodra het licht dooft. */
export const LED: Record<Signaal, { kleur: string; knipper: boolean }> = {
  oproep: { kleur: '00c050', knipper: true },
  medicatie: { kleur: 'ff7800', knipper: false },
  afspraak: { kleur: 'ff7800', knipper: false },
  bericht: { kleur: '0050ff', knipper: false },
}

export function ledUrl(s: Signaal | null): string {
  if (!s) return `${ADRES}/led?kleur=uit`
  const { kleur, knipper } = LED[s]
  return `${ADRES}/led?kleur=${kleur}${knipper ? '&knipper=1' : ''}`
}

async function vraag(url: string, ms = 1500): Promise<boolean> {
  const stop = new AbortController()
  const t = window.setTimeout(() => stop.abort(), ms)
  try {
    const r = await fetch(url, { signal: stop.signal, cache: 'no-store' })
    return r.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(t)
  }
}

/** Zoekt het hulpappje en sluit het aan op het licht. Alleen op de gekoppelde tablet. */
export function useLedbalk(actief: boolean) {
  useEffect(() => {
    if (!actief) return
    let losmaken: (() => void) | null = null
    let weg = false

    const zoek = async () => {
      if (losmaken || weg) return
      if (!(await vraag(`${ADRES}/status`))) return
      if (weg) return
      // Bij het opstarten uit: een kleur van vóór een herstart klopt niet meer.
      void vraag(ledUrl(null))
      losmaken = useLicht.getState().voegUitgangToe((s) => {
        void vraag(ledUrl(s))
      })
    }

    void zoek()
    // Het hulpappje kan later opstarten dan de browser.
    const id = window.setInterval(() => void zoek(), 5 * 60_000)
    return () => {
      weg = true
      window.clearInterval(id)
      losmaken?.()
    }
  }, [actief])
}
