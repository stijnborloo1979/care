import type { AgendaEvent } from '../../services/agenda'
import type { Item } from '../../services/homeMemory'
import type { PersonCard } from '../../services/people'
import type { MemoryNote } from '../../services/notes'
import { hhmm } from '../../lib/time'
import { whatNow } from '../today/whatNow'

export interface Answer {
  vraag: string
  titel: string
  regels: string[]
  /** Waar de knop onder het antwoord naartoe gaat, als die er is. */
  link?: { naar: string; label: string }
  bellen?: { naam: string; nummer: string }
  /** Waar het antwoord vandaan komt. Zo weet de persoon wie het schreef. */
  bron?: string
}

export interface Kennis {
  events: AgendaEvent[]
  items: Item[]
  people: PersonCard[]
  notes: MemoryNote[]
  tz: string
}

const NIETS_GEVONDEN = 'Dat weet ik niet zeker.'

function normaliseer(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function vindItem(vraag: string, items: Item[]): Item | null {
  const v = normaliseer(vraag)
  for (const i of items) {
    const naam = normaliseer(i.name)
    if (v.includes(naam)) return i
    const eerste = naam.split(' ')[0]
    if (eerste.length > 3 && v.includes(eerste)) return i
  }
  if (v.includes('tv') || v.includes('televisie')) {
    return items.find((i) => normaliseer(i.name).includes('tele')) ?? null
  }
  if (v.includes('pil') || v.includes('medic')) {
    return items.find((i) => normaliseer(i.name).includes('medic')) ?? null
  }
  return null
}

function vindPersoon(vraag: string, people: PersonCard[]): PersonCard | null {
  const v = normaliseer(vraag)
  return people.find((p) => p.kind !== 'self' && v.includes(normaliseer(p.name))) ?? null
}

/**
 * Antwoordt uitsluitend met wat familie heeft ingevuld. Vindt ze niets,
 * dan zegt ze dat — nooit iets aanvullen of gokken. Een app die verzint
 * waar de bril ligt, is erger dan een app die het niet weet.
 */
export function beantwoord(vraag: string, k: Kennis, nu = new Date()): Answer {
  const v = normaliseer(vraag)
  const leeg: Answer = { vraag, titel: NIETS_GEVONDEN, regels: ['Wil je het aan je familie vragen?'] }

  // bellen
  if (/^bel\b|bellen|opbellen/.test(v)) {
    const p = vindPersoon(vraag, k.people)
    if (p?.phone) {
      return {
        vraag,
        titel: `Bel ${p.name}`,
        regels: [`${p.relation} — ${p.phone}`],
        bellen: { naam: p.name, nummer: p.phone },
      }
    }
  }

  // wat moet ik nu doen
  if (v.includes('wat moet ik') || v.includes('wat nu') || v.includes('nu doen')) {
    const { current, next } = whatNow(k.events, nu)
    const regels: string[] = []
    if (current?.note) regels.push(current.note)
    if (!current) regels.push('Er is nu niets dat moet.')
    if (next) regels.push(`Daarna: ${next.title} om ${hhmm(new Date(next.starts_at), k.tz)}.`)
    return {
      vraag,
      titel: current ? `${current.emoji ?? ''} ${current.title}`.trim() : 'Even rusten',
      regels,
    }
  }

  // wie komt er
  if (v.includes('wie komt') || v.includes('bezoek')) {
    const bezoek = k.events.filter((e) => e.person_id)
    if (bezoek.length > 0) {
      return {
        vraag,
        titel: 'Vandaag',
        regels: bezoek.map((e) => `${e.title} om ${hhmm(new Date(e.starts_at), k.tz)}.`),
      }
    }
    return { vraag, titel: 'Er komt vandaag niemand langs.', regels: [] }
  }

  // wanneer komt X
  if (v.includes('wanneer')) {
    const p = vindPersoon(vraag, k.people)
    if (p) {
      const e = k.events.find((x) => x.person_id === p.id)
      if (e) {
        return {
          vraag,
          titel: `${p.name} komt om ${hhmm(new Date(e.starts_at), k.tz)}`,
          regels: e.note ? [e.note] : [],
        }
      }
      return {
        vraag,
        titel: `${p.name} staat vandaag niet in de planning.`,
        regels: ['Wil je het aan je familie vragen?'],
      }
    }
  }

  // waar ligt iets
  if (v.includes('waar')) {
    const item = vindItem(vraag, k.items)
    if (item) {
      return {
        vraag,
        titel: `${item.emoji ?? ''} ${item.name}`.trim(),
        regels: item.where_text ? [item.where_text] : [],
        link: { naar: `/memory/ding/${item.id}`, label: 'Toon uitleg' },
      }
    }
    const notitie = k.notes.find((n) => v.includes(normaliseer(n.title)))
    if (notitie) return { vraag, titel: notitie.title, regels: [notitie.body] }
  }

  // hoe werkt iets
  if (v.includes('hoe')) {
    const item = vindItem(vraag, k.items)
    if (item) {
      return {
        vraag,
        titel: `${item.emoji ?? ''} ${item.name}`.trim(),
        regels: item.where_text ? [item.where_text] : [],
        link: { naar: `/memory/ding/${item.id}`, label: 'Stap voor stap' },
      }
    }
  }

  // iemand
  const p = vindPersoon(vraag, k.people)
  if (p) {
    return {
      vraag,
      titel: p.name,
      regels: [p.description, p.detail].filter((r): r is string => !!r),
      link: { naar: `/wie/${p.id}`, label: `Meer over ${p.name}` },
    }
  }

  // een weetje
  const notitie = k.notes.find(
    (n) => v.includes(normaliseer(n.title)) || normaliseer(n.body).includes(v),
  )
  if (notitie) return { vraag, titel: notitie.title, regels: [notitie.body] }

  return leeg
}

export const VOORBEELDVRAGEN = [
  'Wat moet ik nu doen?',
  'Wie komt er vandaag?',
  'Waar is mijn bril?',
  'Hoe zet ik de televisie aan?',
  'Wanneer komt Els?',
]
