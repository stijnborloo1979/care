import type { AgendaEvent } from './agenda'
import { HUIS_PREFIX } from './afdelingsdagPuur'
import { hhmm, localDateKey } from '../lib/time'
import { t } from '../lib/i18n'

/** Uitstap (80): de familie neemt de bewoner mee. */
export interface Uitstap {
  id: string
  household_id: string
  met_wie: string
  vertrek: string
  terug: string
  notitie: string | null
  status: 'gepland' | 'weg' | 'terug' | 'geannuleerd'
  vertrokken_at: string | null
  terug_at: string | null
  created_by: string | null
  created_at: string
}

export type Toestand = 'gepland' | 'weg' | 'te-laat' | 'terug' | 'geannuleerd'

/** Een half uur later dan gezegd en nog niet terug aangeduid: opvolgen. */
const MARGE = 30 * 60_000

export function toestand(u: Pick<Uitstap, 'status' | 'terug'>, nu: Date): Toestand {
  if (u.status === 'weg' && nu.getTime() > new Date(u.terug).getTime() + MARGE) return 'te-laat'
  return u.status
}

/** Loopt ze nu (of vandaag nog) mee? Voor de lijst van het team. */
export function actueel(u: Uitstap, nu: Date, tz: string): boolean {
  if (u.status === 'geannuleerd' || u.status === 'terug') return false
  if (u.status === 'weg') return true
  const vandaag = localDateKey(nu, tz)
  return localDateKey(new Date(u.vertrek), tz) === vandaag || (new Date(u.vertrek) > nu && new Date(u.vertrek).getTime() - nu.getTime() < 7 * 24 * 3600_000)
}

/**
 * Op de tablet: "Uitstap met Els — Je bent terug om 17:00." op het uur van
 * vertrek. Alleen vandaag, niet geannuleerd. Geen afvinkknop (huis-item).
 */
export function uitstapNaarAgenda(lijst: Uitstap[], hh: string, nu: Date, tz: string): AgendaEvent[] {
  const vandaag = localDateKey(nu, tz)
  return lijst
    .filter((u) => u.status !== 'geannuleerd')
    // Gepland maar nooit vertrokken en het einde is voorbij: niet tonen alsof het gebeurde.
    .filter((u) => !(u.status === 'gepland' && new Date(u.terug) <= nu))
    .filter((u) => localDateKey(new Date(u.vertrek), tz) === vandaag || u.status === 'weg')
    .map((u) => {
      const voorbij = u.status === 'terug' || (u.status === 'weg' && new Date(u.terug) <= nu)
      return {
        id: `${HUIS_PREFIX}uitstap-${u.id}`,
        household_id: hh,
        starts_at: u.vertrek,
        title: u.status === 'weg' && !voorbij ? t('uitstap.weg', { naam: u.met_wie }) : t('uitstap.titel', { naam: u.met_wie }),
        emoji: '🚗',
        kind: 'other' as const,
        note: t('uitstap.terugOm', { tijd: hhmm(new Date(u.terug), tz) }),
        person_id: null,
        done_at: voorbij ? (u.terug_at ?? u.terug) : null,
      }
    })
}

/** "vandaag 14:00–17:00", "za 4 okt 14:00 – zo 5 okt 11:00" (Nederlands: familie- en zorgscherm). */
export function vanTot(u: Pick<Uitstap, 'vertrek' | 'terug'>, tz: string, nu: Date = new Date()): string {
  const v = new Date(u.vertrek)
  const tr = new Date(u.terug)
  const dag = (d: Date) =>
    localDateKey(d, tz) === localDateKey(nu, tz)
      ? 'vandaag'
      : new Intl.DateTimeFormat('nl-BE', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  const uur = (d: Date) => new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)
  if (localDateKey(v, tz) === localDateKey(tr, tz)) return `${dag(v)} ${uur(v)}–${uur(tr)}`
  return `${dag(v)} ${uur(v)} – ${dag(tr)} ${uur(tr)}`
}

/** Hoeveel minuten loopt deze tijdzone voor op UTC, op dat moment? */
function verschilMinuten(utc: number, tz: string): number {
  const d = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utc))
  const g = (t: string) => Number(d.find((x) => x.type === t)?.value)
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(utc / 60_000) * 60_000) / 60_000
}

/**
 * "2026-10-03T14:00" zoals ingetikt, in de tijdzone van de bewoner (niet die
 * van de browser: wie vanuit het buitenland een uitstap meldt, bedoelt het
 * uur in het woonzorgcentrum).
 */
export function uitLokaleTijd(waarde: string, tz: string): Date {
  const [d, u] = waarde.split('T')
  const [j, m, dg] = d.split('-').map(Number)
  const [h, mi] = (u ?? '00:00').split(':').map(Number)
  const alsUtc = Date.UTC(j, m - 1, dg, h, mi)
  let t = alsUtc - verschilMinuten(alsUtc, tz) * 60_000
  // Nog eens, voor het geval de zomertijd net tussen beide ligt.
  t = alsUtc - verschilMinuten(t, tz) * 60_000
  return new Date(t)
}

/** Omgekeerd: een moment als "2026-10-03T14:00" in de tijdzone van de bewoner. */
export function naarLokaleTijd(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}
