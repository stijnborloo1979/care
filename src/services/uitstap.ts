import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
import type { Uitstap } from './uitstapPuur'

export * from './uitstapPuur'

const VELDEN = 'id, household_id, met_wie, vertrek, terug, notitie, status, vertrokken_at, terug_at, created_by, created_at'

function ontbreekt(e: { code?: string } | null) {
  return !!e && (ontbrekendeFunctie(e) || ['42P01', 'PGRST205'].includes(e.code ?? ''))
}

/** Lopend en komend (en wat gisteren terugkwam), voor één of meer bewoners. */
export async function uitstappen(hh: string | string[]): Promise<Uitstap[]> {
  const lijst = Array.isArray(hh) ? hh : [hh]
  if (lijst.length === 0) return []
  const sinds = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('uitstap')
    .select(VELDEN)
    .in('household_id', lijst)
    // Ook een uitstap waarvan niemand "terug" aanduidde: die moet blijven
    // opvallen tot iemand het doet, niet na een dag verdwijnen.
    .or(`terug.gte.${sinds},status.eq.weg`)
    .order('vertrek')
    .limit(100)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as Uitstap[]
}

export async function meldUitstap(p: { hh: string; metWie: string; vertrek: Date; terug: Date; notitie?: string; auteur: string }) {
  const { error } = await supabase.from('uitstap').insert({
    household_id: p.hh,
    met_wie: p.metWie.trim(),
    vertrek: p.vertrek.toISOString(),
    terug: p.terug.toISOString(),
    notitie: p.notitie?.trim() || null,
    created_by: p.auteur,
  })
  if (error) throw error
}

export async function uitstapStap(id: string, stap: 'weg' | 'terug' | 'geannuleerd') {
  const { error } = await supabase.rpc('uitstap_stap', { uitstap_id: id, stap })
  if (error) throw error
}
