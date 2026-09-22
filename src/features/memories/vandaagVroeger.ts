import type { MemoryPhoto } from '../../services/memories'

export interface Herinnering {
  foto: MemoryPhoto
  /** Hoeveel jaar geleden, als het jaartal gekend is. */
  jarenGeleden: number | null
  /** Echt een verjaardag: vandaag precies zoveel jaar geleden. */
  verjaardag: boolean
}

function dagnummer(sleutel: string): number {
  const [j, m, d] = sleutel.split('-').map(Number)
  return Math.floor(Date.UTC(j, m - 1, d) / 86_400_000)
}

/**
 * Welke herinnering vandaag op het scherm komt.
 *
 * Eerst een echte verjaardag: een foto met een datum die vandaag valt,
 * zoals een trouwdag. Anders elke dag een andere, in een vaste volgorde,
 * zodat het niet willekeurig verspringt bij herladen.
 */
export function kiesHerinnering(fotos: MemoryPhoto[], dag: string): Herinnering | null {
  if (fotos.length === 0) return null
  const [jaar, , ] = dag.split('-').map(Number)
  const maandDag = dag.slice(5)

  const echt = fotos.find((f) => f.taken_on && f.taken_on.slice(5) === maandDag)
  if (echt) {
    const j = echt.taken_on ? Number(echt.taken_on.slice(0, 4)) : echt.year
    return { foto: echt, jarenGeleden: j ? jaar - j : null, verjaardag: true }
  }

  const gesorteerd = [...fotos].sort((a, b) => a.id.localeCompare(b.id))
  const foto = gesorteerd[dagnummer(dag) % gesorteerd.length]
  return { foto, jarenGeleden: foto.year ? jaar - foto.year : null, verjaardag: false }
}
