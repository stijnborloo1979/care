import type { VastMoment } from './afdelingsdagPuur'

/** Wat een bewoner bij een maaltijd deed (107). */
export type MaaltijdStatus = 'gegeten' | 'half' | 'niet'

export const STATUSSEN: { waarde: MaaltijdStatus; woord: string }[] = [
  { waarde: 'gegeten', woord: 'Gegeten' },
  { waarde: 'half', woord: 'Half' },
  { waarde: 'niet', woord: 'Niet' },
]

/** Een rij uit maaltijd_analyse(): één maaltijd op één afdeling, over een periode. */
export interface MaaltijdRij {
  afdeling_naam: string
  moment_titel: string
  aantal_verwacht: number
  aantal_geregistreerd: number
  aantal_gegeten: number
  aantal_half: number
  aantal_niet: number
}

/** Procent, afgerond; 0 als er niets te tellen is. */
export function procent(deel: number, totaal: number): number {
  return totaal > 0 ? Math.round((deel / totaal) * 100) : 0
}

/** Maaltijden die nog niet geregistreerd zijn. Nooit negatief. */
export function nietGeregistreerd(r: Pick<MaaltijdRij, 'aantal_verwacht' | 'aantal_geregistreerd'>): number {
  return Math.max(0, r.aantal_verwacht - r.aantal_geregistreerd)
}

/**
 * Valt deze maaltijd op? Dat is zo als er vaak "niet" gegeten wordt, en
 * dat is wat het WZC wil zien. De drempel is 20 procent van de verwachte
 * maaltijden.
 */
export function opvallend(r: MaaltijdRij, drempel = 20): boolean {
  return procent(r.aantal_niet, r.aantal_verwacht) >= drempel && r.aantal_verwacht > 0
}

/** Totaal over alle rijen, voor de bovenste regel van de analyse. */
export function totaal(rijen: MaaltijdRij[]) {
  const som = (f: (r: MaaltijdRij) => number) => rijen.reduce((s, r) => s + f(r), 0)
  const verwacht = som((r) => r.aantal_verwacht)
  return {
    verwacht,
    gegeten: procent(som((r) => r.aantal_gegeten), verwacht),
    half: procent(som((r) => r.aantal_half), verwacht),
    niet: procent(som((r) => r.aantal_niet), verwacht),
    nietGeregistreerd: som(nietGeregistreerd),
  }
}

/** ISO-dag van de week: 1 = maandag … 7 = zondag, zoals in de vaste dag. */
export function isoDag(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/**
 * De maaltijden die vandaag op deze afdeling gelden: het hele huis en de
 * afdeling zelf, alleen soort "maaltijd", alleen actief, op deze weekdag.
 */
export function maaltijdMomenten(vast: VastMoment[], afdelingId: string | null, dag: Date): VastMoment[] {
  return vast
    .filter((m) => m.soort === 'maaltijd' && m.actief)
    .filter((m) => m.department_id === null || m.department_id === afdelingId)
    .filter((m) => m.dagen.includes(isoDag(dag)))
    .sort((a, b) => a.begint.localeCompare(b.begint))
}
