import { supabase } from '../lib/supabase'

/**
 * Een afspraak of herinnering via LifeAngle Voice. Loopt via de RPC
 * voice_add_event: die controleert rol, soort, titel en tijdstip, en maakt
 * bij een herhaalde actieId geen tweede item.
 */
export async function voiceAddEvent(p: {
  householdId: string
  startsAt: Date
  titel: string
  soort: 'appt' | 'reminder'
  emoji: string
  notitie: string | null
  actieId: string
}) {
  const { error } = await supabase.rpc('voice_add_event', {
    hh: p.householdId,
    starts: p.startsAt.toISOString(),
    titel: p.titel,
    soort: p.soort,
    emoji: p.emoji,
    notitie: p.notitie ?? '',
    action_id: p.actieId,
  })
  if (error) throw error
}

export interface KomendItem {
  starts_at: string
  title: string
  kind: string
}

/**
 * Wat er de komende dagen gepland staat. Maaltijden, routines en
 * medicatie laten we weg: dat is elke dag hetzelfde en overstemt de
 * afspraken waar het om gaat.
 */
export async function getKomende(householdId: string, dagen = 7): Promise<KomendItem[]> {
  const nu = new Date()
  const { data, error } = await supabase
    .from('agenda_event')
    .select('starts_at, title, kind')
    .eq('household_id', householdId)
    .gte('starts_at', nu.toISOString())
    .lt('starts_at', new Date(nu.getTime() + dagen * 24 * 3600_000).toISOString())
    .in('kind', ['appt', 'visit', 'reminder', 'other'])
    .order('starts_at')
    .limit(8)
  if (error) throw error
  return (data ?? []) as KomendItem[]
}
