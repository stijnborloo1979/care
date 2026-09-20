import { supabase } from '../lib/supabase'
import { localDateKey } from '../lib/time'

export type EventKind = 'meal' | 'med' | 'visit' | 'appt' | 'routine' | 'other'

export interface AgendaEvent {
  id: string
  household_id: string
  starts_at: string
  title: string
  emoji: string | null
  kind: EventKind
  note: string | null
  person_id: string | null
  done_at: string | null
}

/**
 * Haal een ruime band op en filter daarna op de lokale dag. Dat is
 * betrouwbaarder dan de dag in SQL uitrekenen: bij zomertijd schuift een
 * routine van 08:00 anders een uur op, en dat zou medicatie raken.
 */
export async function getToday(householdId: string, tz: string): Promise<AgendaEvent[]> {
  const nu = new Date()
  const van = new Date(nu.getTime() - 24 * 3600_000).toISOString()
  const tot = new Date(nu.getTime() + 24 * 3600_000).toISOString()

  const { data, error } = await supabase
    .from('agenda_event')
    .select('id, household_id, starts_at, title, emoji, kind, note, person_id, done_at')
    .eq('household_id', householdId)
    .gte('starts_at', van)
    .lte('starts_at', tot)
    .order('starts_at')

  if (error) throw error

  const vandaag = localDateKey(nu, tz)
  return ((data ?? []) as AgendaEvent[]).filter(
    (e) => localDateKey(new Date(e.starts_at), tz) === vandaag,
  )
}

export async function markDone(eventId: string, done = true) {
  const { error } = await supabase.rpc('mark_done', { event_id: eventId, done })
  if (error) throw error
}
