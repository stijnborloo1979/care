import { supabase } from '../../lib/supabase'
import { ontbrekendeFunctie } from '../../lib/ontbrekendeFunctie'
import type { MaaltijdRij, MaaltijdStatus } from '../../services/maaltijdPuur'

/**
 * Maaltijden per bewoner (107, 109). Ontbreekt de migratie: niets, geen fout.
 *
 * Elke maaltijd staat standaard op "gegeten" (bron 'standaard') tot het team
 * of de familie iets anders zet. De database rekent dat uit; er worden geen
 * standaardrijen opgeslagen.
 */

/** Bron: 'team' = door medewerker bevestigd, 'uitstap' = familie meldde uitstap, 'standaard' = niet gecontroleerd. */
export type MaaltijdBron = 'team' | 'uitstap' | 'standaard'

export interface MaaltijdStand {
  household_id: string
  afdeling_dag_id: string
  moment_titel: string
  status: MaaltijdStatus
  bron: MaaltijdBron
  notitie: string | null
}

export async function maaltijdDagOverzicht(org: string, dag: string): Promise<MaaltijdStand[]> {
  const { data, error } = await supabase.rpc('maaltijd_dag_overzicht', { p_org: org, p_dag: dag })
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as MaaltijdStand[]
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
  const { data, error } = await supabase.rpc('maaltijd_analyse_stand', { p_org: org, p_van: van, p_tot: tot })
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as MaaltijdRij[]
}
