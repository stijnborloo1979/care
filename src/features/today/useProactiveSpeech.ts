import { useEffect, useState } from 'react'
import type { AgendaEvent } from '../../services/agenda'
import { hhmm, localDateKey } from '../../lib/time'
import { huidigePrefs } from '../settings/useDisplayPrefs'
import { spreek } from '../voice/useSpeech'
import { useRadio } from '../radio/radioStore'
import { useLicht } from '../licht/lichtStore'

const GEZEGD = 'thuis.gezegd'
const VOORAF_MIN = 10

function gezegdVandaag(dag: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(GEZEGD) ?? '{}')
    return new Set(v.dag === dag ? v.ids : [])
  } catch {
    return new Set()
  }
}

function onthoudGezegd(dag: string, ids: Set<string>) {
  try {
    localStorage.setItem(GEZEGD, JSON.stringify({ dag, ids: [...ids] }))
  } catch {
    // Opslag geweigerd: dan kan iets twee keer gezegd worden, niet erger.
  }
}

/**
 * Zegt uit zichzelf wat er zo meteen komt. Tonen alleen is niet genoeg:
 * wie niet naar het scherm kijkt, mist het. TimeSteps en Tessa doen dit al;
 * zonder dit verliest de app elke vergelijking.
 *
 * Browsers laten spraak pas toe na één aanraking van het scherm. Daarom
 * geeft deze hook terug of dat al gebeurd is, zodat het scherm erom kan
 * vragen. Op een tablet die altijd aanstaat, is dat één tik na elke herstart.
 */
export function useProactiveSpeech(events: AgendaEvent[], tz: string) {
  const [vrij, setVrij] = useState(false)

  useEffect(() => {
    if (vrij) return
    function ontgrendel() {
      setVrij(true)
      // Een stil zinnetje, zodat de browser spraak vanaf nu toelaat.
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ')
        u.volume = 0
        window.speechSynthesis.speak(u)
      }
    }
    window.addEventListener('pointerdown', ontgrendel, { once: true })
    return () => window.removeEventListener('pointerdown', ontgrendel)
  }, [vrij])

  useEffect(() => {
    if (!vrij) return

    function kijk() {
      if (!huidigePrefs().voice) return
      const nu = new Date()
      const uur = Number(hhmm(nu, tz).slice(0, 2))
      // 's Nachts zwijgen: een stem om drie uur maakt ongerust, niet rustig.
      if (uur >= 22 || uur < 7) return

      const dag = localDateKey(nu, tz)
      const gezegd = gezegdVandaag(dag)

      for (const e of events) {
        if (e.done_at || gezegd.has(e.id)) continue
        const min = Math.round((new Date(e.starts_at).getTime() - nu.getTime()) / 60000)

        // "09:00 Radio aan" in een routine: op het uur zelf de favoriete
        // zender starten, zonder aankondiging vooraf.
        if (/\bradio\b/i.test(e.title)) {
          if (min <= 0 && min > -15 && !useRadio.getState().speelt) {
            useRadio.getState().speelFavoriet()
            gezegd.add(e.id)
            onthoudGezegd(dag, gezegd)
          }
          continue
        }

        let zin: string | null = null
        if (min > 0 && min <= VOORAF_MIN) {
          zin = `Over ${min} ${min === 1 ? 'minuut' : 'minuten'}: ${e.title}.`
        } else if (min <= 0 && min > -15) {
          // De app ging pas open na het begin: dan zeggen we het nu nog.
          zin = `Het is tijd voor: ${e.title}.`
        }

        if (zin) {
          if (huidigePrefs().licht) useLicht.getState().start(e.kind === 'med' ? 'medicatie' : 'afspraak')
          spreek(e.note ? `${zin} ${e.note}` : zin)
          gezegd.add(e.id)
          onthoudGezegd(dag, gezegd)
          // Eén ding per keer; de rest volgt bij de volgende controle.
          break
        }
      }
    }

    kijk()
    const id = window.setInterval(kijk, 30_000)
    return () => window.clearInterval(id)
  }, [vrij, events, tz])

  return { spraakVrij: vrij }
}
