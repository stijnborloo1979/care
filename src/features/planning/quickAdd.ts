/**
 * Eén veld in plaats van vier: "donderdag 14u dokter Janssens" wordt een
 * afspraak. Bewust een pure functie met een meegegeven klok, zodat ze te
 * testen is — en bewust behoudend: begrijpt ze de tijd niet, dan geeft ze
 * null terug in plaats van te gokken. Een afspraak op het verkeerde uur
 * is erger dan een afspraak die je zelf moet invullen.
 */

export interface QuickAddResultaat {
  startsAt: Date
  titel: string
  /** Wat er herkend is, om aan de gebruiker te tonen voor hij bevestigt. */
  uitleg: string
}

const DAGEN: Record<string, number> = {
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
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
    const woordDatum = hap(new RegExp(`\\b(\\d{1,2})\\s+(${MAANDEN.join('|')})\\b`))
    if (woordDatum) {
      datum = new Date(nu.getFullYear(), MAANDEN.indexOf(woordDatum[2]), Number(woordDatum[1]))
      dagUitleg = `${woordDatum[1]} ${woordDatum[2]}`
    }
  }

  // 2. vandaag, morgen, overmorgen
  if (!datum) {
    const relatief = hap(/\b(vandaag|morgen|overmorgen)\b/)
    if (relatief) {
      const dagen = { vandaag: 0, morgen: 1, overmorgen: 2 }[relatief[1] as 'vandaag']
      datum = new Date(nu)
      datum.setDate(datum.getDate() + dagen)
      dagUitleg = relatief[1]
    }
  }

  // 3. een weekdag: altijd de eerstvolgende, nooit een dag in het verleden
  if (!datum) {
    const weekdag = hap(new RegExp(`\\b(?:volgende\\s+)?(${Object.keys(DAGEN).join('|')})\\b`))
    if (weekdag) {
      const doel = DAGEN[weekdag[1]]
      datum = new Date(nu)
      let stap = (doel - nu.getDay() + 7) % 7
      if (stap === 0) stap = 7
      datum.setDate(datum.getDate() + stap)
      dagUitleg = weekdag[1]
    }
  }

  // 4. het uur: 14u, 14u30, 14:00, om 9 uur
  let uur: number | null = null
  let minuut = 0
  const tijd =
    hap(/\b(\d{1,2})[:.](\d{2})\b/) ??
    hap(/\b(\d{1,2})\s?u\s?(\d{2})\b/) ??
    hap(/\b(\d{1,2})\s?u\b/) ??
    hap(/\bom\s+(\d{1,2})(?:\s*uur)?\b/)

  if (tijd) {
    uur = Number(tijd[1])
    minuut = tijd[2] ? Number(tijd[2]) : 0
    // "om 3" op de middag bedoelt bijna nooit 3 uur 's nachts.
    if (uur < 8 && !/\b(\d{1,2})[:.]/.test(tijd[0])) uur += 12
    if (uur > 23 || minuut > 59) return null
  }

  const titel = schoon(rest.replace(/\b(om|op|de|een)\b/gi, ' '))
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
    uitleg: `${dagUitleg || 'vandaag'} om ${tijdUitleg}`,
  }
}
