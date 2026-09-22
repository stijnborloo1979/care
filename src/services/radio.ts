import { supabase } from '../lib/supabase'

export interface Zender {
  id: string
  household_id: string
  name: string
  stream_url: string
  favicon: string | null
  sort: number
}

export interface Zoekresultaat {
  naam: string
  url: string
  favicon: string | null
  land: string
  bitrate: number
}

export const MAX_ZENDERS = 4

export async function getZenders(householdId: string): Promise<Zender[]> {
  const { data, error } = await supabase
    .from('radio_station')
    .select('id, household_id, name, stream_url, favicon, sort')
    .eq('household_id', householdId)
    .order('sort')
  if (error) throw error
  return (data ?? []) as Zender[]
}

export async function addZender(householdId: string, r: Zoekresultaat, sort: number) {
  const { error } = await supabase.from('radio_station').insert({
    household_id: householdId,
    name: r.naam,
    stream_url: r.url,
    favicon: r.favicon,
    sort,
  })
  if (error) throw error
}

export async function deleteZender(id: string) {
  const { error } = await supabase.from('radio_station').delete().eq('id', id)
  if (error) throw error
}

export async function herschik(zenders: Zender[]) {
  for (const [i, z] of zenders.entries()) {
    const { error } = await supabase.from('radio_station').update({ sort: i }).eq('id', z.id)
    if (error) throw error
  }
}

// Radio Browser is een open, gratis databank van zenders. Er zijn meerdere
// spiegelservers; ligt er één plat, dan proberen we de volgende.
const SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
]

/**
 * Zoekt zenders op naam. Alleen streams die een gewone browser kan
 * afspelen: https (anders weigert de browser ze op een beveiligde site)
 * en geen HLS (dat speelt Chrome niet af zonder extra bibliotheek).
 */
export async function zoekZenders(naam: string, land = 'BE'): Promise<Zoekresultaat[]> {
  const params = new URLSearchParams({
    name: naam,
    limit: '40',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  })
  if (land) params.set('countrycode', land)

  for (const server of SERVERS) {
    try {
      const res = await fetch(`${server}/json/stations/search?${params}`)
      if (!res.ok) continue
      type Rij = {
        name: string
        url_resolved: string
        favicon: string
        countrycode: string
        bitrate: number
        hls: number
      }
      const rijen = (await res.json()) as Rij[]
      const gezien = new Set<string>()
      return rijen
        .filter((r) => r.url_resolved?.startsWith('https://') && r.hls !== 1)
        .filter((r) => {
          // Veel zenders staan er meermaals in; één per naam volstaat.
          const k = r.name.trim().toLowerCase()
          if (gezien.has(k)) return false
          gezien.add(k)
          return true
        })
        .slice(0, 12)
        .map((r) => ({
          naam: r.name.trim(),
          url: r.url_resolved,
          favicon: r.favicon?.startsWith('https://') ? r.favicon : null,
          land: r.countrycode,
          bitrate: r.bitrate,
        }))
    } catch {
      // Volgende server proberen.
    }
  }
  throw new Error('De zenderlijst is nu niet bereikbaar. Probeer het straks opnieuw.')
}
