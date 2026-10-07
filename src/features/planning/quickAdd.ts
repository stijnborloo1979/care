/**
 * Eén veld in plaats van vier: "donderdag 14u dokter Janssens" wordt een
 * afspraak. Bewust een pure functie met een meegegeven klok, zodat ze te
 * testen is — en bewust behoudend: begrijpt ze de tijd niet, dan geeft ze
 * null terug in plaats van te gokken. Een afspraak op het verkeerde uur
 * is erger dan een afspraak die je zelf moet invullen.
 */

import { tt } from '../../lib/uiTaal'

export interface QuickAddResultaat {
  startsAt: Date
  titel: string
  /** Wat er herkend is, om aan de gebruiker te tonen voor hij bevestigt. */
  uitleg: string
}

// Nederlands, Frans en Engels door elkaar: wie typt, kiest zijn taal niet
// eerst, en geen enkel woord betekent in de ene taal iets anders dan in de
// andere.
const DAGEN: Record<string, number> = {
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const MAANDEN = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
]

const MAANDEN_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MAANDEN_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Maandnaam in eender welke taal → 0..11, of -1. */
function maandVan(woord: string): number {
  for (const lijst of [MAANDEN, MAANDEN_FR, MAANDEN_EN]) {
    const i = lijst.indexOf(woord)
    if (i >= 0) return i
  }
  return -1
}

const ALLE_MAANDEN = [...new Set([...MAANDEN, ...MAANDEN_FR, ...MAANDEN_EN])].join('|')

/** Hoeveel dagen vanaf vandaag; de langste vorm eerst. */
const RELATIEF: Record<string, number> = {
  vandaag: 0,
  overmorgen: 2,
  morgen: 1,
  "aujourd'hui": 0,
  'aujourd’hui': 0,
  'après-demain': 2,
  demain: 1,
  today: 0,
  'day after tomorrow': 2,
  tomorrow: 1,
}

function schoon(tekst: string) {
  return tekst.replace(/\s+/g, ' ').trim()
}

export function quickAdd(invoer: string, nu = new Date()): QuickAddResultaat | null {
  let rest = ' ' + schoon(invoer) + ' '
  const laag = () => rest.toLowerCase()

  let datum: Date | null = null
  let dagUitleg = ''

  function hap(patroon: RegExp): RegExpMatchArray | null {
    const m = laag().match(patroon)
    if (!m) return null
    const start = (m.index ?? 0)
    rest = rest.slice(0, start) + ' ' + rest.slice(start + m[0].length)
    return m
  }

  // 1. een echte datum: 14/3, 14-03, 14 maart
  const cijferdatum = hap(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (cijferdatum) {
    const dag = Number(cijferdatum[1])
    const maand = Number(cijferdatum[2]) - 1
    const jaar = cijferdatum[3] ? Number(cijferdatum[3].padStart(4, '20')) : nu.getFullYear()
    datum = new Date(jaar, maand, dag)
    dagUitleg = `${dag}/${maand + 1}`
  }

  if (!datum) {
    // 14 maart, 14 mars, 14 march (en "march 14")
    const woordDatum = hap(new RegExp(`\\b(\\d{1,2})\\s+(${ALLE_MAANDEN})\\b`))
    const omgekeerd = woordDatum ? null : hap(new RegExp(`\\b(${ALLE_MAANDEN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`))
    if (woordDatum) {
      datum = new Date(nu.getFullYear(), maandVan(woordDatum[2]), Number(woordDatum[1]))
      dagUitleg = `${woordDatum[1]} ${woordDatum[2]}`
    } else if (omgekeerd) {
      datum = new Date(nu.getFullYear(), maandVan(omgekeerd[1]), Number(omgekeerd[2]))
      dagUitleg = `${omgekeerd[2]} ${omgekeerd[1]}`
    }
  }

  // 2. vandaag, morgen, overmorgen
  if (!datum) {
    const relatief = hap(new RegExp(`(?<![\\p{L}-])(${Object.keys(RELATIEF).join('|')})(?![\\p{L}-])`, 'u'))
    if (relatief) {
      const dagen = RELATIEF[relatief[1]]
      datum = new Date(nu)
      datum.setDate(datum.getDate() + dagen)
      dagUitleg = relatief[1]
    }
  }

  // 3. een weekdag: altijd de eerstvolgende, nooit een dag in het verleden
  if (!datum) {
    const weekdag =
      hap(new RegExp(`\\b(?:volgende\\s+|next\\s+)?(${Object.keys(DAGEN).join('|')})(?:\\s+prochain)?\\b`))
    if (weekdag) {
      const doel = DAGEN[weekdag[1]]
      datum = new Date(nu)
      let stap = (doel - nu.getDay() + 7) % 7
      if (stap === 0) stap = 7
      datum.setDate(datum.getDate() + stap)
      dagUitleg = weekdag[1]
    }
  }

  // 4. het uur: 14u, 14u30, 14:00, om 9 uur — 14h, 14h30, à 9 heures —
  //    2pm, 2:30 pm, at 9
  let uur: number | null = null
  let minuut = 0
  const ampm = hap(/\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)\b/)
  const tijd =
    ampm ??
    hap(/\b(\d{1,2})[:.](\d{2})\b/) ??
    hap(/\b(\d{1,2})\s?[uh]\s?(\d{2})\b/) ??
    hap(/\b(\d{1,2})\s?[uh]\b/) ??
    hap(/(?:\bom|(?<!\p{L})à|\bat)\s+(\d{1,2})(?:\s*(?:uur|heures?|o'clock))?\b/u)

  if (tijd) {
    uur = Number(tijd[1])
    minuut = tijd[2] ? Number(tijd[2]) : 0
    if (ampm) {
      if (uur < 1 || uur > 12) return null
      if (ampm[3] === 'pm' && uur < 12) uur += 12
      if (ampm[3] === 'am' && uur === 12) uur = 0
    } else if (uur < 8 && !/\b(\d{1,2})[:.]/.test(tijd[0])) {
      // "om 3" op de middag bedoelt bijna nooit 3 uur 's nachts.
      uur += 12
    }
    if (uur > 23 || minuut > 59) return null
  }

  // Losse verbindingswoorden weg, in de drie talen ("à" heeft geen \b).
  const titel = schoon(
    rest.replace(/\b(om|op|de|een|le|la|les|un|une|chez|at|on|the|a)\b/gi, ' ').replace(/(?<!\p{L})à(?!\p{L})/gu, ' '),
  )
  if (!titel) return null
  if (!datum && uur === null) return null

  const resultaat = datum ? new Date(datum) : new Date(nu)
  resultaat.setHours(uur ?? 9, minuut, 0, 0)

  // Geen datum en het uur is al voorbij? Dan bedoelt men morgen.
  if (!datum && resultaat.getTime() < nu.getTime()) {
    resultaat.setDate(resultaat.getDate() + 1)
    dagUitleg = 'morgen'
  }

  const tijdUitleg = `${String(resultaat.getHours()).padStart(2, '0')}:${String(
    resultaat.getMinutes(),
  ).padStart(2, '0')}`

  return {
    startsAt: resultaat,
    titel: titel.charAt(0).toUpperCase() + titel.slice(1),
    uitleg: tt('{dag} om {uur}', { dag: tt(dagUitleg || 'vandaag'), uur: tijdUitleg }),
  }
}
