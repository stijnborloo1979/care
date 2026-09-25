import { supabase } from '../lib/supabase'

/**
 * De innamegeschiedenis: wat er bevestigd werd, wanneer en door wie, plus
 * de wijzigingen aan het schema zelf.
 *
 * Overal geldt hetzelfde voorbehoud als in de database: dit beschrijft
 * bevestigingen, geen inname. De app weet dat er op een knop gedrukt is,
 * meer niet.
 */

export type Wie = 'zelf' | 'familie' | 'zorgverlener' | 'onbekend' | 'open'

export interface InnameMoment {
  log_id: string
  medication_id: string
  naam: string
  dosis: string | null
  due_at: string
  taken_at: string | null
  wie: Wie
  wie_naam: string | null
}

export interface SamenvattingRij {
  /** Een tijdstip als "08:00", of "alles" voor het totaal. */
  tijdstip: string
  momenten: number
  bevestigd: number
  /** Hoeveel daarvan de persoon zelf bevestigde. */
  zelf: number
  /** Over hoeveel dagen deze cijfers gaan. Zonder dat zegt een percentage niets. */
  dagen: number
}

export interface SchemaWijziging {
  id: string
  medication_name: string
  veld: 'naam' | 'dosis' | 'tijden' | 'instructie' | 'status'
  oud: string | null
  nieuw: string | null
  changed_at: string
  changed_by: string | null
}

function dagSleutel(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Standaard de laatste 30 dagen: genoeg om een patroon te zien, klein genoeg om te laden. */
export function periode(dagen = 30): { van: string; tot: string } {
  const nu = new Date()
  return {
    van: dagSleutel(new Date(nu.getTime() - dagen * 24 * 3600_000)),
    tot: dagSleutel(nu),
  }
}

export async function getInnameGeschiedenis(
  householdId: string,
  van: string,
  tot: string,
): Promise<InnameMoment[]> {
  const { data, error } = await supabase.rpc('medication_history', {
    hh: householdId,
    van,
    tot,
  })
  if (error) throw error
  return (data ?? []) as InnameMoment[]
}

export async function getSamenvatting(
  householdId: string,
  van: string,
  tot: string,
): Promise<SamenvattingRij[]> {
  const { data, error } = await supabase.rpc('medication_summary', {
    hh: householdId,
    van,
    tot,
  })
  if (error) throw error
  return (data ?? []) as SamenvattingRij[]
}

export async function getSchemaWijzigingen(
  householdId: string,
  van: string,
): Promise<SchemaWijziging[]> {
  const { data, error } = await supabase
    .from('medication_change')
    .select('id, medication_name, veld, oud, nieuw, changed_at, changed_by')
    .eq('household_id', householdId)
    .gte('changed_at', `${van}T00:00:00Z`)
    .order('changed_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as SchemaWijziging[]
}

export async function setVoorraad(medicationId: string, doses: number | null) {
  const { error } = await supabase.rpc('set_medication_stock', {
    med: medicationId,
    doses,
  })
  if (error) throw error
}

/**
 * Hoeveel dagen de voorraad nog meegaat, bij het huidige schema. Null als
 * er geen voorraad bijgehouden wordt of het medicijn gestopt is.
 */
export function dagenVoorraad(doses: number | null, perDag: number): number | null {
  if (doses === null || doses === undefined || perDag <= 0) return null
  return Math.floor(doses / perDag)
}
