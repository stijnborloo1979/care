import { supabase } from '../lib/supabase'

/**
 * De velden voor "Dit ben ik".
 *
 * Alles wat de app al weet — familie, voorkeuren, routines, het
 * levensverhaal — komt uit de bestaande tabellen. Dit zijn de drie dingen
 * die nergens stonden en waar zorg het meest aan heeft, plus een vrij veld.
 *
 * Bewust vrije tekst. Wat iemand rustig maakt, laat zich niet aanvinken.
 */
export interface Profiel {
  /** Hoe ze aangesproken wil worden. Niet iedereen heet voor iedereen hetzelfde. */
  noemNaam: string
  /** Hoe je best met haar praat: traag, één vraag tegelijk, links gaan staan. */
  omgang: string
  /** Wat helpt als ze onrustig is. Het belangrijkste veld van het hele blad. */
  rust: string
  /** Waar ze van overstuur raakt. */
  vermijden: string
  /** Wat familie er nog bij wil zetten. */
  vrij: string
}

export const LEEG: Profiel = { noemNaam: '', omgang: '', rust: '', vermijden: '', vrij: '' }

export async function getProfiel(householdId: string): Promise<Profiel> {
  const { data, error } = await supabase
    .from('household')
    .select('profiel')
    .eq('id', householdId)
    .maybeSingle()
  if (error) throw error
  const ruw = (data as { profiel: Partial<Profiel> } | null)?.profiel ?? {}
  return { ...LEEG, ...ruw }
}

export async function setProfiel(householdId: string, deel: Partial<Profiel>) {
  const { error } = await supabase.rpc('set_profiel', { hh: householdId, p: deel })
  if (error) throw error
}
