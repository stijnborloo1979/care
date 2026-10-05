import { tt } from '../lib/uiTaal'

/** Kamers en bezetting (82). */
export interface Kamer {
  id: string
  org_id: string
  department_id: string
  naam: string
  bedden: number
  actief: boolean
  notitie: string | null
}

export interface Bezetting {
  household_id: string
  naam: string
  department_id: string | null
  kamer: string | null
  sinds: string
}

export interface KamerStand {
  kamer: Kamer
  bewoners: Bezetting[]
  vrij: number
}

export interface AfdelingStand {
  id: string | null
  naam: string
  kamers: KamerStand[]
  /** Bewoners op deze afdeling zonder (gekende) kamer. */
  zonderKamer: Bezetting[]
  bedden: number
  bezet: number
}

const vergelijk = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true })

/** Kamernamen vergelijken zonder hoofdletters of spaties: "12 " = "12". */
const sleutel = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Per afdeling: welke kamer wie, hoeveel vrij, en wie nog geen (gekende)
 * kamer heeft. Een bewoner telt mee in een kamer als de kamernaam van het
 * verblijf gelijk is aan die van een kamer op dezelfde afdeling.
 */
export function bezettingPerAfdeling(
  afdelingen: { id: string; name: string }[],
  kamers: Kamer[],
  bewoners: Bezetting[],
): AfdelingStand[] {
  const lijst: AfdelingStand[] = afdelingen
    .slice()
    .sort((a, b) => vergelijk(a.name, b.name))
    .map((a) => {
      const hier = bewoners.filter((b) => b.department_id === a.id)
      const eigen = kamers.filter((k) => k.department_id === a.id).sort((x, y) => vergelijk(x.naam, y.naam))
      const standen = eigen.map((k) => {
        const bw = hier.filter((b) => sleutel(b.kamer) === sleutel(k.naam))
        return { kamer: k, bewoners: bw, vrij: k.actief ? Math.max(0, k.bedden - bw.length) : 0 }
      })
      const ingedeeld = new Set(standen.flatMap((s) => s.bewoners.map((b) => b.household_id)))
      return {
        id: a.id,
        naam: a.name,
        kamers: standen,
        zonderKamer: hier.filter((b) => !ingedeeld.has(b.household_id)),
        bedden: standen.filter((s) => s.kamer.actief).reduce((n, s) => n + s.kamer.bedden, 0),
        bezet: hier.length,
      }
    })
  const zonder = bewoners.filter((b) => !b.department_id || !afdelingen.some((a) => a.id === b.department_id))
  if (zonder.length > 0) lijst.push({ id: null, naam: tt('Zonder afdeling'), kamers: [], zonderKamer: zonder, bedden: 0, bezet: zonder.length })
  return lijst
}

/** Totalen voor de tegels. Vrije bedden alleen als er kamers zijn ingevoerd. */
export function totalen(standen: AfdelingStand[]): { bewoners: number; bedden: number | null; vrij: number | null } {
  const bewoners = standen.reduce((n, a) => n + a.bezet, 0)
  const bedden = standen.reduce((n, a) => n + a.bedden, 0)
  if (bedden === 0) return { bewoners, bedden: null, vrij: null }
  const vrij = standen.reduce((n, a) => n + a.kamers.reduce((m, k) => m + k.vrij, 0), 0)
  return { bewoners, bedden, vrij }
}
