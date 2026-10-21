import { supabase } from '../../lib/supabase'
import { ontbrekendeFunctie } from '../../lib/ontbrekendeFunctie'
import type { MaaltijdRij, MaaltijdStatus } from '../../services/maaltijdPuur'

/** Maaltijdregistratie per bewoner (107). Ontbreekt de migratie: niets, geen fout. */

export interface MaaltijdRegistratie {
  household_id: string
  afdeling_dag_id: string
  dag: string
  status: MaaltijdStatus
  notitie: string | null
}

export async function registratieVoor(hhs: string[], dag: string): Promise<MaaltijdRegistratie[]> {
  if (hhs.length === 0) return []
  const { data, error } = await supabase
    .from('maaltijd_registratie')
    .select('household_id, afdeling_dag_id, dag, status, notitie')
    .in('household_id', hhs)
    .eq('dag', dag)
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as MaaltijdRegistratie[]
}

export async function maaltijdZet(p: { hh: string; moment: string; dag: string; status: MaaltijdStatus; notitie?: string }): Promise<void> {
  const { error } = await supabase.rpc('maaltijd_zet', {
    p_household: p.hh,
    p_moment: p.moment,
    p_dag: p.dag,
    p_status: p.status,
    p_notitie: p.notitie ?? null,
  })
  if (error) throw error
}

export async function maaltijdAnalyse(org: string, van: string, tot: string): Promise<MaaltijdRij[]> {
  const { data, error } = await supabase.rpc('maaltijd_analyse', { p_org: org, p_van: van, p_tot: tot })
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as MaaltijdRij[]
}
