import { useEffect } from 'react'
import { locale } from '../../lib/i18n'
import { herkennerKlasse } from './spraak'

function schoon(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "Hallo Anna" opent LifeAngle Voice zonder te tikken.
 *
 * Alleen als familie of de persoon het zelf aanzette (standaard uit), en
 * alleen zolang de app zichtbaar is: een verborgen tabblad luistert niet.
 * Werkt in browsers met doorlopende spraakherkenning (Chrome, Edge).
 */
export function useWekwoord(opts: { actief: boolean; naam: string; onWek: () => void }) {
  const { actief, naam, onWek } = opts

  useEffect(() => {
    const Klasse = herkennerKlasse()
    const doel = schoon(naam)
    if (!actief || !doel || !Klasse) return

    let gestopt = false
    let rec: InstanceType<NonNullable<ReturnType<typeof herkennerKlasse>>> | null = null
    let herstart: number | null = null
    let fouten = 0

    const zinnen = [`hallo ${doel}`, `hey ${doel}`, `hoi ${doel}`, `dag ${doel}`, `ok ${doel}`, `oke ${doel}`]

    function start() {
      if (gestopt || document.visibilityState !== 'visible') return
      try {
        rec = new Klasse!()
        rec.lang = locale()
        rec.continuous = true
        rec.interimResults = true
        rec.maxAlternatives = 1
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = schoon(e.results[i][0].transcript)
            if (zinnen.some((z) => t.includes(z))) {
              gestopt = true
              try {
                rec?.abort()
              } catch {
                /* al gestopt */
              }
              onWek()
              return
            }
          }
          fouten = 0
        }
        rec.onerror = (e) => {
          // Geen toestemming: niet blijven proberen.
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') gestopt = true
          else fouten++
        }
        rec.onend = () => {
          if (gestopt) return
          // Rustig opnieuw; bij herhaalde fouten steeds trager.
          herstart = window.setTimeout(start, Math.min(30_000, 500 * 2 ** fouten))
        }
        rec.start()
      } catch {
        herstart = window.setTimeout(start, 5000)
      }
    }

    function zichtbaar() {
      if (document.visibilityState === 'visible' && !rec) start()
      if (document.visibilityState !== 'visible') {
        try {
          rec?.abort()
        } catch {
          /* al gestopt */
        }
        rec = null
      }
    }

    start()
    document.addEventListener('visibilitychange', zichtbaar)
    return () => {
      gestopt = true
      document.removeEventListener('visibilitychange', zichtbaar)
      if (herstart !== null) window.clearTimeout(herstart)
      try {
        rec?.abort()
      } catch {
        /* al gestopt */
      }
    }
  }, [actief, naam, onWek])
}
