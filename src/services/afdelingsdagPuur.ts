import type { AgendaEvent } from './agenda'

/**
 * De dag van de afdeling (78): de vaste dag van het woonzorgcentrum
 * (maaltijden, rust, koffie) plus de activiteiten van vandaag, voor één
 * bewoner. Wie thuis woont, krijgt gewoon een lege lijst.
 */
export interface HuisMoment {
  bron: 'vast' | 'activiteit'
  id: string
  titel: string
  soort: 'maaltijd' | 'rust' | 'activiteit' | 'verzorging' | 'andere'
  emoji: string | null
  begint: string
  eindigt: string | null
  plaats: string | null
  status: 'gepland' | 'geannuleerd' | 'afgelopen' | null
  deelname: 'ingeschreven' | 'aanwezig' | 'afwezig' | null
}

export const HUIS_PREFIX = 'huis:'

export function isHuis(e: Pick<AgendaEvent, 'id'> | null | undefined): boolean {
  return !!e && e.id.startsWith(HUIS_PREFIX)
}

const EMOJI: Record<HuisMoment['soort'], string> = {
  maaltijd: '🍽️',
  rust: '🛋️',
  activiteit: '🎵',
  verzorging: '🛁',
  andere: '📌',
}

/** Zonder einduur is een moment een uur lang "nu". */
const STANDAARD_DUUR = 60 * 60_000

/** Telt het mee op de tablet? Geannuleerd of afwezig: niet. */
export function telt(m: HuisMoment): boolean {
  if (m.bron === 'activiteit' && m.status === 'geannuleerd') return false
  if (m.deelname === 'afwezig') return false
  return true
}

/**
 * Als agenda-items, zodat "nu", "daarna" en "vandaag" ze vanzelf meenemen.
 * Een voorbij moment krijgt done_at: dan is het nooit meer "nu", en er komt
 * geen afvinkknop (de bewoner vinkt de maaltijd van het huis niet af).
 */
export function huisNaarAgenda(lijst: HuisMoment[], hh: string, nu: Date): AgendaEvent[] {
  return lijst.filter(telt).map((m) => {
    const einde = m.eindigt ? new Date(m.eindigt).getTime() : new Date(m.begint).getTime() + STANDAARD_DUUR
    return {
      id: HUIS_PREFIX + m.id,
      household_id: hh,
      starts_at: m.begint,
      title: m.titel,
      emoji: m.emoji || EMOJI[m.soort] || '📌',
      kind: m.soort === 'maaltijd' ? 'meal' : 'other',
      note: m.plaats,
      person_id: null,
      done_at: einde <= nu.getTime() ? new Date(einde).toISOString() : null,
    }
  })
}

/** De eigen agenda en die van het huis, op tijd. */
export function samenVoegen(agenda: AgendaEvent[], huis: AgendaEvent[]): AgendaEvent[] {
  if (huis.length === 0) return agenda
  return [...agenda, ...huis].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

/** Waar was ze bij? Alleen activiteiten waar het team "aanwezig" aanduidde. */
export function aanwezigBij(lijst: HuisMoment[]): HuisMoment[] {
  return lijst.filter((m) => m.bron === 'activiteit' && m.deelname === 'aanwezig' && m.status !== 'geannuleerd')
}

export const WEEKDAGEN: { nr: number; kort: string }[] = [
  { nr: 1, kort: 'ma' },
  { nr: 2, kort: 'di' },
  { nr: 3, kort: 'wo' },
  { nr: 4, kort: 'do' },
  { nr: 5, kort: 'vr' },
  { nr: 6, kort: 'za' },
  { nr: 7, kort: 'zo' },
]

/** "elke dag", "weekdagen", "weekend" of "ma, wo, vr". */
export function dagenTekst(dagen: number[]): string {
  const set = [...new Set(dagen)].sort()
  const s = set.join(',')
  if (s === '1,2,3,4,5,6,7') return 'elke dag'
  if (s === '1,2,3,4,5') return 'weekdagen'
  if (s === '6,7') return 'weekend'
  return set.map((d) => WEEKDAGEN.find((w) => w.nr === d)?.kort ?? '?').join(', ')
}

/** "12:00:00" → "12:00" */
export function uurKort(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}
