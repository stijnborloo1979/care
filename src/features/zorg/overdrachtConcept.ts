/**
 * Concept voor de overdracht: wat er sinds de vorige dienst is gebeurd,
 * samengesteld uit opgeslagen gegevens. Elke regel verwijst naar de bron
 * (id en tijd), zodat de verantwoordelijke kan nagaan waar het vandaan komt.
 *
 * Bewust zonder eigen oordeel: geen samenvatting, geen interpretatie, geen
 * aanvullingen. De tekst van een zorgnotitie wordt letterlijk overgenomen.
 * Niets hiervan wordt opgeslagen voordat de verantwoordelijke het bevestigt.
 */

export type BronSoort = 'zorgnotitie' | 'nieuw_verblijf' | 'activiteit'

export type Bron = { soort: BronSoort; id: string; tijd: string }

export type Regel = { tekst: string; bron: Bron }

export type Invoer = {
  /** Het begin van het venster: alleen wat hierna gebeurde telt. */
  sinds: string
  notities: {
    id: string
    body: string
    category: string
    created_at: string
    kamer: string | null
    /** Id van de notitie die deze vervangt, zoals in care_note.vervangt. */
    vervangt: string | null
  }[]
  nieuweVerblijven: { id: string; kamer: string | null; started_at: string }[]
  activiteiten: { id: string; titel: string; starts_at: string; plaats: string | null; status: string }[]
}

const tijd = (iso: string) =>
  new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }).format(new Date(iso))

const CATEGORIE: Record<string, string> = {
  observatie: 'observatie',
  zorg: 'zorg',
  maaltijd: 'maaltijd',
  slaap: 'slaap',
  stemming: 'stemming',
  incident: 'incident',
  overig: 'overig',
}

/** Bouwt het concept. Lege lijst als er niets nieuws is. */
export function maakConcept(i: Invoer): Regel[] {
  const sinds = Date.parse(i.sinds)
  const na = (iso: string) => Date.parse(iso) >= sinds

  // Een notitie die door een latere is vervangen, telt niet meer mee.
  const vervangen = new Set(i.notities.map((n) => n.vervangt).filter((x): x is string => !!x))

  const regels: Regel[] = []

  for (const v of i.nieuweVerblijven) {
    if (!na(v.started_at)) continue
    regels.push({
      tekst: `Nieuw verblijf: kamer ${v.kamer ?? 'onbekend'}, sinds ${tijd(v.started_at)}.`,
      bron: { soort: 'nieuw_verblijf', id: v.id, tijd: v.started_at },
    })
  }

  for (const a of i.activiteiten) {
    if (a.status !== 'gepland' || !na(a.starts_at)) continue
    const plaats = a.plaats ? ` (${a.plaats})` : ''
    regels.push({
      tekst: `Activiteit om ${tijd(a.starts_at)}: ${a.titel}${plaats}.`,
      bron: { soort: 'activiteit', id: a.id, tijd: a.starts_at },
    })
  }

  for (const n of i.notities) {
    if (!na(n.created_at) || vervangen.has(n.id)) continue
    const cat = CATEGORIE[n.category] ?? n.category
    regels.push({
      tekst: `${n.kamer ? `Kamer ${n.kamer}` : 'Bewoner'} · ${cat} (${tijd(n.created_at)}): ${n.body}`,
      bron: { soort: 'zorgnotitie', id: n.id, tijd: n.created_at },
    })
  }

  return regels
}

/** De tekst die in het invulveld komt: één regel per bron. */
export function conceptTekst(regels: Regel[]): string {
  return regels.map((r) => r.tekst).join('\n')
}

/**
 * Het begin van de dienst die nu overdraagt: het concept beslaat wat sinds
 * die start is gebeurd. Vroeg 07-15, laat 15-22, nacht 22-07.
 */
export function beginHuidigeDienst(nu: Date = new Date()): Date {
  const d = new Date(nu)
  const h = d.getHours()
  if (h >= 7 && h < 15) {
    d.setHours(7, 0, 0, 0)
  } else if (h >= 15 && h < 22) {
    d.setHours(15, 0, 0, 0)
  } else {
    d.setHours(22, 0, 0, 0)
    if (h < 7) d.setDate(d.getDate() - 1)
  }
  return d
}
