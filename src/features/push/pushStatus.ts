import { supabase } from '../../lib/supabase'

/**
 * Waarom komt een melding niet aan?
 *
 * Push kan op drie plaatsen stilvallen, en alle drie doen ze dat zonder een
 * spoor: dit toestel gaf geen toestemming, het huishouden staat niet op
 * "ondersteund", of de edge function draait niet omdat pg_cron uit staat.
 * Dit haalt die drie op zodat het scherm kan zeggen wat eraan scheelt.
 */
export interface PushStatus {
  /** Toestellen van familie die meldingen aan hebben staan. */
  toestellen: number
  /** Staat dít toestel daarbij? Toestemming is per toestel én per account. */
  eigen_toestel: boolean
  /** Laat het ondersteuningsniveau push toe? */
  niveau_ok: boolean
  /** Meldingen van de laatste twee uur die nog niet verstuurd zijn. */
  wachtend: number
}

export async function getPushStatus(householdId: string): Promise<PushStatus | null> {
  const { data, error } = await supabase.rpc('push_status', { hh: householdId })
  if (error) throw error
  return ((data ?? [])[0] ?? null) as PushStatus | null
}

/**
 * Een testmelding, langs precies dezelfde weg als een echte. Een test die
 * een andere weg neemt, bewijst niets.
 */
export async function stuurTestmelding(householdId: string) {
  const { error } = await supabase.rpc('test_push', { hh: householdId })
  if (error) throw error
  try {
    await supabase.functions.invoke('push-notify')
  } catch {
    // De cron vangt het op, als die draait.
  }
}
