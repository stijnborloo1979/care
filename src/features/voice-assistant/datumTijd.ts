/**
 * Datum en uur uit gewone taal, ten opzichte van de klok van het
 * huishouden. Pure functies met een meegegeven "nu", zodat ze te testen
 * zijn — dezelfde aanpak als quickAdd() en whatNow().
 *
 * Bewust behoudend: wat niet eenduidig is, geeft null. "Volgende week"
 * zonder dag, of "vanavond" zonder uur, is geen datum of uur maar een
 * reden om het te vragen. LifeAngle gokt niet.
 *
 * Voorlopig Nederlands. Een andere taal krijgt een eigen woordenlijst in
 * WOORDEN; de logica blijft dezelfde.
 */

import { localDateKey, plusDagen } from '../../lib/time'
import type { Taal } from '../../lib/i18n'

interface Woorden {
  weekdagen: string[] // zondag = 0
  maanden: string[]
  getallen: Record<string, number>
}

const NL: Woorden = {
  weekdagen: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
  maanden: [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december',
  ],
  getallen: {
    een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7,
    acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
  },
}

const WOORDEN: Partial<Record<Taal, Woorden>> = { nl: NL }

function woorden(taal: Taal): Woorden {
  return WOORDEN[taal] ?? NL
}

export function normaal(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Weekdag (0 = zondag) van een datumsleutel YYYY-MM-DD. */
export function weekdagVan(sleutel: string): number {
  const [j, m, d] = sleutel.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d)).getUTCDay()
}

export type Dagdeel = 'ochtend' | 'middag' | 'namiddag' | 'avond' | null

export function dagdeelIn(tekst: string): Dagdeel {
  const t = normaal(tekst)
  if (/\b(vanavond|'s avonds|s avonds|deze avond|avond)\b/.test(t)) return 'avond'
  if (/\b(namiddag|deze namiddag|vannamiddag)\b/.test(t)) return 'namiddag'
  if (/\b(vanmiddag|'s middags|s middags)\b/.test(t)) return 'middag'
  if (/\b(morgenvroeg|vanochtend|vanmorgen|'s morgens|s morgens|'s ochtends|s ochtends|ochtend|voormiddag)\b/.test(t) || /\bmorgen vroeg\b/.test(t)) return 'ochtend'
  return null
}

export interface DatumUitkomst {
  /** YYYY-MM-DD, of null als er iets over een dag gezegd werd dat niet eenduidig is. */
  datum: string | null
  /** Er werd iets over de dag gezegd (ook als het niet eenduidig was). */
  genoemd: boolean
}

/**
 * vandaag, morgen, overmorgen, morgenvroeg, vanavond, (volgende) maandag,
 * volgende week vrijdag, 14 maart, 14/3.
 */
export function vindDatum(tekst: string, nu: Date, tz: string, taal: Taal = 'nl'): DatumUitkomst {
  const w = woorden(taal)
  const t = normaal(tekst)
  const vandaag = localDateKey(nu, tz)
  const vandaagWd = weekdagVan(vandaag)

  // 14/3 of 14-3(-2027)
  const cijfers = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (cijfers) {
    const d = Number(cijfers[1])
    const m = Number(cijfers[2])
    let j = cijfers[3] ? Number(cijfers[3].padStart(4, '20')) : Number(vandaag.slice(0, 4))
    const kandidaat = maak(j, m, d)
    if (!kandidaat) return { datum: null, genoemd: true }
    if (!cijfers[3] && kandidaat < vandaag) j += 1
    return { datum: maak(j, m, d), genoemd: true }
  }

  // 14 maart
  const maandRe = new RegExp(`\\b(\\d{1,2})\\s+(${w.maanden.join('|')})\\b`)
  const woordDatum = t.match(maandRe)
  if (woordDatum) {
    const d = Number(woordDatum[1])
    const m = w.maanden.indexOf(woordDatum[2]) + 1
    let j = Number(vandaag.slice(0, 4))
    const kandidaat = maak(j, m, d)
    if (!kandidaat) return { datum: null, genoemd: true }
    if (kandidaat < vandaag) j += 1
    return { datum: maak(j, m, d), genoemd: true }
  }

  if (/\bovermorgen\b/.test(t)) return { datum: plusDagen(vandaag, 2), genoemd: true }
  if (/\bmorgenvroeg\b|\bmorgen\b/.test(t) && !/\b'?s morgens\b|\bvanmorgen\b/.test(t))
    return { datum: plusDagen(vandaag, 1), genoemd: true }
  if (/\b(vandaag|vanavond|vanmiddag|vannamiddag|deze namiddag|deze avond|vanochtend|vanmorgen)\b/.test(t))
    return { datum: vandaag, genoemd: true }

  const dagRe = new RegExp(`\\b(${w.weekdagen.join('|')})\\b`)
  const dag = t.match(dagRe)
  const volgendeWeek = /\bvolgende week\b/.test(t)

  if (dag) {
    const doel = w.weekdagen.indexOf(dag[1])
    if (volgendeWeek) {
      // "volgende week vrijdag": de vrijdag in de week (maandag–zondag)
      // na deze week.
      const naarMaandag = ((1 - vandaagWd + 7) % 7) || 7
      const maandagVolgende = plusDagen(vandaag, naarMaandag)
      const stap = (doel - 1 + 7) % 7
      return { datum: plusDagen(maandagVolgende, stap), genoemd: true }
    }
    // "vrijdag" of "volgende vrijdag": de eerstvolgende, nooit vandaag.
    let stap = (doel - vandaagWd + 7) % 7
    if (stap === 0) stap = 7
    return { datum: plusDagen(vandaag, stap), genoemd: true }
  }

  if (volgendeWeek || /\b(binnenkort|later|deze week|ooit)\b/.test(t)) return { datum: null, genoemd: true }
  return { datum: null, genoemd: false }
}

function maak(j: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(j, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null // 31 februari
  return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getal(s: string, w: Woorden): number | null {
  if (/^\d{1,2}$/.test(s)) return Number(s)
  return w.getallen[s] ?? null
}

/**
 * 14:00, 14.30, 14u, 14u30, om 14 uur, om twee uur, rond drie uur,
 * half drie, kwart over drie, kwart voor vier. Geeft HH:MM of null.
 *
 * Kleine uren zonder dagdeel: "om twee uur naar de dokter" is 14:00, niet
 * 02:00. Wat niet klopt, ziet de persoon in de bevestiging.
 */
export function vindTijd(tekst: string, taal: Taal = 'nl'): string | null {
  const w = woorden(taal)
  const t = normaal(tekst)
  const getalRe = `(\\d{1,2}|${Object.keys(w.getallen).join('|')})`
  const deel = dagdeelIn(t)

  let uur: number | null = null
  let min = 0
  let expliciet24 = false

  let m = t.match(/\b(\d{1,2})[:.h](\d{2})\b/) ?? t.match(/\b(\d{1,2})\s?u\s?(\d{2})\b/)
  if (m) {
    uur = Number(m[1])
    min = Number(m[2])
    expliciet24 = uur >= 13 || m[1].length === 2 && m[1].startsWith('0')
  }

  if (uur === null && (m = t.match(new RegExp(`\\bhalf\\s+${getalRe}\\b`)))) {
    const g = getal(m[1], w)
    if (g !== null) {
      uur = g - 1
      min = 30
    }
  }
  if (uur === null && (m = t.match(new RegExp(`\\bkwart\\s+(over|na)\\s+${getalRe}\\b`)))) {
    const g = getal(m[2], w)
    if (g !== null) {
      uur = g
      min = 15
    }
  }
  if (uur === null && (m = t.match(new RegExp(`\\bkwart\\s+voor\\s+${getalRe}\\b`)))) {
    const g = getal(m[1], w)
    if (g !== null) {
      uur = g - 1
      min = 45
    }
  }
  if (uur === null && (m = t.match(new RegExp(`\\b${getalRe}\\s*(uur|u)\\b(?:\\s+(\\d{1,2}))?`)))) {
    const g = getal(m[1], w)
    if (g !== null) {
      uur = g
      if (m[3]) min = Number(m[3])
    }
  }
  if (uur === null && (m = t.match(new RegExp(`\\b(?:om|rond|tegen|omstreeks)\\s+${getalRe}\\b`)))) {
    const g = getal(m[1], w)
    if (g !== null) uur = g
  }
  if (uur === null) {
    if (/\b(middernacht)\b/.test(t)) return '00:00'
    if (/\b('s middags om twaalf|middaguur)\b/.test(t)) return '12:00'
    return null
  }

  if (uur >= 13) expliciet24 = true
  if (!expliciet24) {
    if (deel === 'avond' && uur < 12) uur += 12
    else if ((deel === 'namiddag' || deel === 'middag') && uur >= 1 && uur <= 7) uur += 12
    else if (deel === null && uur >= 1 && uur <= 6) uur += 12
  }
  if (uur === 24) uur = 0
  if (uur < 0 || uur > 23 || min < 0 || min > 59) return null
  return `${String(uur).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "14:00" → "twee uur" voor de stem, "14:30" → "half drie". */
export function tijdVoorStem(hhmm: string): string {
  const [u, m] = hhmm.split(':').map(Number)
  const namen = ['twaalf', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf']
  const h12 = (x: number) => namen[x % 12]
  if (m === 0) return `${h12(u)} uur`
  if (m === 30) return `half ${h12(u + 1)}`
  if (m === 15) return `kwart over ${h12(u)}`
  if (m === 45) return `kwart voor ${h12(u + 1)}`
  return hhmm.replace(':', ' uur ')
}

/** "morgen", "overmorgen", "vandaag", of "vrijdag 3 oktober". */
export function datumVoorStem(datum: string, nu: Date, tz: string, locale = 'nl-BE'): string {
  const vandaag = localDateKey(nu, tz)
  if (datum === vandaag) return 'vandaag'
  if (datum === plusDagen(vandaag, 1)) return 'morgen'
  if (datum === plusDagen(vandaag, 2)) return 'overmorgen'
  const [j, m, d] = datum.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(j, m - 1, d)))
}
