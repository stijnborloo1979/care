import type { MemoryPhoto } from '../../services/memories'
import type { LifeStory } from '../../services/stories'
import { tt } from '../../lib/uiTaal'

export interface Starter {
  sleutel: string
  tekst: string
  foto?: string | null
}

/** Een getal uit een tekst, zodat dezelfde dag dezelfde keuze geeft. */
function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/**
 * Twee dingen om over te praten bij een bezoek: een foto van vroeger en
 * een verhaal dat ze zelf vertelde. Elke dag een andere keuze, op elk
 * toestel dezelfde. Uit het dagboek komt niets: dat is van haar.
 */
export function gespreksstarters(fotos: MemoryPhoto[], verhalen: LifeStory[], dag: string, naam: string): Starter[] {
  const uit: Starter[] = []
  const metFoto = fotos.filter((f) => f.title?.trim())
  if (metFoto.length > 0) {
    const f = metFoto[hash(`f${dag}`) % metFoto.length]
    uit.push({
      sleutel: `f${f.id}`,
      tekst: tt('{titel}. Toon de foto en vraag wat {naam} zich ervan herinnert.', {
        titel: `${f.title}${f.year ? ` (${f.year})` : ''}`,
        naam,
      }),
      foto: f.photo_path,
    })
  }
  const verteld = verhalen.filter((v) => (v.soort ?? 'verhaal') === 'verhaal' && v.shared !== false && (v.body?.trim() || v.audio_path))
  if (verteld.length > 0) {
    const v = verteld[hash(`v${dag}`) % verteld.length]
    uit.push({ sleutel: `v${v.id}`, tekst: tt('{naam} vertelde over "{vraag}". Vraag er eens meer over.', { naam, vraag: v.question }) })
  }
  return uit
}
