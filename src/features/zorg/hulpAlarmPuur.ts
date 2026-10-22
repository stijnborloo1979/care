import { tt } from '../../lib/uiTaal'
import type { HulpAlarm } from './zorgApi'

/**
 * De regels achter het hulpvraagblok, zonder React of Supabase, zodat ze
 * met een vaste klok te testen zijn.
 */

/** "Kamer 12 · Beuk", of wat er van bekend is. */
export function waar(a: Pick<HulpAlarm, 'kamer' | 'afdeling'>): string {
  return [a.kamer ? tt('kamer {nr}', { nr: a.kamer }) : null, a.afdeling].filter(Boolean).join(' · ')
}

/** "net nu", "3 min geleden", "1 u 5 min geleden". Vanaf de eerste vraag: zo lang wacht ze al. */
export function hoeLang(sinds: string, nu: Date): string {
  const min = Math.max(0, Math.floor((nu.getTime() - new Date(sinds).getTime()) / 60_000))
  if (min < 1) return tt('net nu')
  if (min < 60) return tt('{n} min geleden', { n: String(min) })
  const u = Math.floor(min / 60)
  const rest = min % 60
  return rest ? tt('{u} u {n} min geleden', { u: String(u), n: String(rest) }) : tt('{u} u geleden', { u: String(u) })
}

/** Nog eens gedrukt? Dan staat dat erbij, want dan wordt het dringender. */
export function herhaling(n: number): string | null {
  if (n <= 0) return null
  return tt('{n}e keer gevraagd', { n: String(n + 1) })
}

/**
 * Is er iets bijgekomen sinds de vorige keer? Een nieuwe vraag, of een
 * vraag waarop opnieuw gedrukt is. Alleen dan een geluid, niet bij elk
 * verversen.
 */
export function ietsNieuws(vorige: HulpAlarm[] | undefined, nu: HulpAlarm[]): boolean {
  if (!vorige) return false
  const oud = new Map(vorige.map((a) => [a.id, a.herhalingen]))
  return nu.some((a) => !oud.has(a.id) || (oud.get(a.id) ?? 0) < a.herhalingen)
}
