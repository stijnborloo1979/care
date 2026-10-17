import type { KnopId } from '../palet/paletten'

/**
 * Tegels die altijd op het startscherm staan, wat familie ook kiest: Vandaag
 * is er om in te zetten, Help is de veiligheid, en Iets onthouden en
 * Herinneringen zijn het waard om altijd te kunnen.
 */
export const VASTE_TEGELS: readonly KnopId[] = ['vandaag', 'help', 'onthouden', 'herinneringen']

/** Tegels die familie of het WZC aan- en uitzet. */
export const KIESBARE_TEGELS = ['wie', 'memory', 'fotos', 'radio', 'medicatie', 'zoeken', 'praten'] as const
export type KiesbareTegel = (typeof KIESBARE_TEGELS)[number]

/**
 * De keuze uit de database, schoon gemaakt: alleen bekende kiesbare tegels,
 * zonder dubbele. Null (of iets wat geen lijst is) betekent: alles zichtbaar.
 */
export function schoneTegels(ruw: unknown): KiesbareTegel[] | null {
  if (!Array.isArray(ruw)) return null
  const bekend = KIESBARE_TEGELS as readonly string[]
  const uniek: KiesbareTegel[] = []
  for (const x of ruw) {
    if (typeof x === 'string' && bekend.includes(x) && !uniek.includes(x as KiesbareTegel)) {
      uniek.push(x as KiesbareTegel)
    }
  }
  return uniek
}

/** Of een tegel op het startscherm hoort te staan. */
export function tegelZichtbaar(id: KnopId, keuze: KiesbareTegel[] | null, zorgVerblijf: boolean): boolean {
  if ((VASTE_TEGELS as readonly KnopId[]).includes(id)) return true
  if (id === 'zorgteam') return zorgVerblijf
  return keuze === null || keuze.includes(id as KiesbareTegel)
}
