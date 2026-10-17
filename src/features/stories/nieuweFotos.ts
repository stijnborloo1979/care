import type { MemoryPhoto } from '../../services/memories'
import type { LifeStory } from '../../services/stories'

/**
 * Foto's waar de persoon nog niets over verteld heeft. Een foto telt als
 * verteld zodra er een verhaal aan hangt (life_story.foto_id). Wat familie
 * bij de foto schreef, telt niet: dat is hun beschrijving, niet het verhaal
 * van de persoon.
 */
export function nieuweFotos(fotos: MemoryPhoto[], verhalen: LifeStory[]): MemoryPhoto[] {
  const verteld = new Set(verhalen.map((v) => v.foto_id).filter((id): id is string => !!id))
  return fotos.filter((f) => !!f.photo_path && !verteld.has(f.id))
}
