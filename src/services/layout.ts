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

/**
 * Is 27_layout.sql nog niet gedraaid?
 *
 * Dan bestaat de kolom home_layout niet en geeft PostgREST 42703 terug. Dat
 * is geen storing maar een migratie die nog moet: de app werkt intussen
 * gewoon op de standaardindeling.
 *
 * Eén keer vaststellen is genoeg. Zonder deze vlag vraagt elk scherm het
 * opnieuw, probeert react-query het nog twee keer, en loopt de console vol
 * met 400's — wat het echte probleem juist onvindbaar maakt.
 */
let kolomOntbreekt = false

export function indelingKolomOntbreekt(): boolean {
  return kolomOntbreekt
}

function isOntbrekendeKolom(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || (error.message ?? '').includes('home_layout')
}

export async function getIndeling(householdId: string): Promise<Indeling> {
  if (kolomOntbreekt) return normaliseer(STANDAARD)

  const { data, error } = await supabase
    .from('household')
    .select('home_layout')
    .eq('id', householdId)
    .maybeSingle()

  if (isOntbrekendeKolom(error)) {
    kolomOntbreekt = true
    return normaliseer(STANDAARD)
  }
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

  if (error) {
    // Onbekende functie of kolom: de migratie ontbreekt. Zeg dat, in plaats
    // van een databasefout die niemand kan plaatsen.
    if (error.code === '42883' || isOntbrekendeKolom(error)) {
      kolomOntbreekt = true
      throw new Error(
        'De indeling kan nog niet bewaard worden: draai supabase/27_layout.sql in de SQL-editor.',
      )
    }
    throw error
  }

  return schoon
}
