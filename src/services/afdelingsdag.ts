import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
import type { HuisMoment, VastMoment } from './afdelingsdagPuur'
import { tt } from '../lib/uiTaal'

export * from './afdelingsdagPuur'

/** dag: 'YYYY-MM-DD' in de tijdzone van het huishouden; leeg = vandaag. */
export async function dagVanBewoner(hh: string, dag?: string): Promise<HuisMoment[]> {
  const { data, error } = await supabase.rpc('dag_van_bewoner', dag ? { hh, dag } : { hh })
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as HuisMoment[]
}


// ---- Voor het woonzorgcentrum: de vaste dag beheren ----------------------


const VELDEN = 'id, org_id, department_id, titel, soort, emoji, begint, eindigt, dagen, actief'

function ontbreekt(e: { code?: string } | null) {
  return !!e && ['42P01', 'PGRST205'].includes(e.code ?? '')
}

export async function vasteDag(org: string): Promise<VastMoment[]> {
  const { data, error } = await supabase.from('afdeling_dag').select(VELDEN).eq('org_id', org).order('begint').limit(200)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as VastMoment[]
}

export async function nieuwVastMoment(p: Omit<VastMoment, 'id' | 'actief'>): Promise<void> {
  const { error } = await supabase.from('afdeling_dag').insert({ ...p, titel: p.titel.trim(), emoji: p.emoji?.trim() || null })
  if (error) throw error
}

export async function zetVastMomentActief(id: string, actief: boolean): Promise<void> {
  const { data, error } = await supabase.from('afdeling_dag').update({ actief }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(tt('Dit kan je niet aanpassen.'))
}

export async function wisVastMoment(id: string): Promise<void> {
  const { data, error } = await supabase.from('afdeling_dag').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(tt('Dit kan je niet wissen.'))
}
