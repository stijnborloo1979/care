import { supabase } from '../lib/supabase'
import { normaliseer, STANDAARD, type Indeling } from '../features/layout/modules'

/**
 * De indeling van het dagscherm, bewaard op het huishouden.
 *
 * Net als de weergave-instellingen: familie regelt het van op afstand en
 * de tablet volgt vanzelf, zonder dat iemand hem in handen hoeft te nemen.
 */

const LOKAAL = 'thuis.indeling'

/**
 * Lokaal bewaren, zoals de tekstgrootte. De tablet toont dan meteen de
 * juiste indeling in plaats van de standaard, die daarna verspringt zodra
 * de query binnen is. Op dat scherm is verspringen erger dan traag.
 */
export function lokaleIndeling(): Indeling {
  try {
    const raw = localStorage.getItem(LOKAAL)
    return raw ? normaliseer(JSON.parse(raw)) : STANDAARD
  } catch {
    return STANDAARD
  }
}

function bewaarLokaal(i: Indeling) {
  try {
    localStorage.setItem(LOKAAL, JSON.stringify(i))
  } catch {
    // Opslag kan geweigerd zijn; de app werkt gewoon door.
  }
}

export async function getIndeling(householdId: string): Promise<Indeling> {
  const { data, error } = await supabase
    .from('household')
    .select('home_layout')
    .eq('id', householdId)
    .maybeSingle()
  if (error) throw error

  const ruw = (data as { home_layout: unknown } | null)?.home_layout
  // Een leeg object betekent: nog nooit ingesteld. Dan de standaard, niet
  // een leeg scherm.
  const leeg = !ruw || (typeof ruw === 'object' && !Array.isArray((ruw as Indeling).tegels))
  const indeling = normaliseer(leeg ? STANDAARD : ruw)
  bewaarLokaal(indeling)
  return indeling
}

export async function setIndeling(householdId: string, indeling: Indeling): Promise<Indeling> {
  const schoon = normaliseer(indeling)
  bewaarLokaal(schoon)
  const { error } = await supabase.rpc('set_home_layout', {
    hh: householdId,
    layout: schoon,
  })
  if (error) throw error
  return schoon
}
