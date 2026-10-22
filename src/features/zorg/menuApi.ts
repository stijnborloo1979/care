import { supabase } from '../../lib/supabase'
import { ontbrekendeFunctie } from '../../lib/ontbrekendeFunctie'
import type { MenuDag } from './menuPuur'

/**
 * Het weekmenu (108). Ontbreekt de migratie: een leeg menu, geen fout.
 * Medewerkers sturen de allergenen niet mee: die blijven wat er al stond.
 */

export interface MenuRij extends MenuDag {
  id: string
  org_id: string
  status: 'concept' | 'gepubliceerd'
  bijgewerkt_at: string
  bevestigd_at: string | null
}

export async function menuVan(org: string, van: string, tot: string): Promise<MenuRij[]> {
  const { data, error } = await supabase
    .from('org_menu')
    .select('*')
    .eq('org_id', org)
    .gte('datum', van)
    .lte('datum', tot)
    .order('datum', { ascending: true })
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as MenuRij[]
}

/** Eén dag opslaan. Allergenen alleen als de gebruiker ze mag wijzigen; anders blijft de oude waarde. */
export async function menuBewaarDag(p: {
  org: string
  dag: MenuDag
  bestaand: MenuRij | undefined
  magAllergenen: boolean
}): Promise<void> {
  const { dag, bestaand, magAllergenen } = p
  const allergenen = (waarde: string | null | undefined, nieuw: string | null) =>
    magAllergenen ? nieuw : (waarde ?? null)
  const { error } = await supabase.rpc('menu_bewaar', {
    p_org: p.org,
    p_datum: dag.datum,
    p_soep: dag.soep,
    p_soep_allergenen: allergenen(bestaand?.soep_allergenen, dag.soep_allergenen),
    p_middag: dag.middag,
    p_middag_allergenen: allergenen(bestaand?.middag_allergenen, dag.middag_allergenen),
    p_dessert: dag.dessert,
    p_dessert_allergenen: allergenen(bestaand?.dessert_allergenen, dag.dessert_allergenen),
    p_notitie: dag.notitie,
  })
  if (error) throw error
}

/** Een reeks dagen bevestigen, zodat het zichtbaar wordt op de tablets. */
export async function menuBevestig(org: string, van: string, tot: string): Promise<number> {
  const { data, error } = await supabase.rpc('menu_publiceer', { p_org: org, p_van: van, p_tot: tot })
  if (error) throw error
  return (data as number) ?? 0
}
