import { supabase } from '../lib/supabase'
import { plusDagen, zonedToUtc } from '../lib/time'
import type { EventKind } from './agenda'

export interface KalenderItem {
  id: string
  household_id: string
  starts_at: string
  title: string
  emoji: string | null
  kind: EventKind
  note: string | null
  person_id: string | null
  routine_id: string | null
  done_at: string | null
  created_by: string | null
  maker: { full_name: string | null } | null
}

export const SOORTEN: { waarde: EventKind; label: string; emoji: string }[] = [
  { waarde: 'appt', label: 'Afspraak', emoji: '📅' },
  { waarde: 'visit', label: 'Bezoek', emoji: '👋' },
  { waarde: 'meal', label: 'Maaltijd', emoji: '🍽️' },
  { waarde: 'med', label: 'Medicatie', emoji: '💊' },
  { waarde: 'routine', label: 'Routine', emoji: '🔁' },
  { waarde: 'other', label: 'Andere', emoji: '📌' },
]

/** Alle items van een week, van maandag 00:00 tot de maandag erna. */
export async function getWeek(
  householdId: string,
  maandag: string,
  tz: string,
): Promise<KalenderItem[]> {
  const van = zonedToUtc(maandag, '00:00', tz).toISOString()
  const tot = zonedToUtc(plusDagen(maandag, 7), '00:00', tz).toISOString()

  const { data, error } = await supabase
    .from('agenda_event')
    .select(
      'id, household_id, starts_at, title, emoji, kind, note, person_id, routine_id, done_at, created_by, maker:created_by (full_name)',
    )
    .eq('household_id', householdId)
    .gte('starts_at', van)
    .lt('starts_at', tot)
    .order('starts_at')
  if (error) throw error
  return (data ?? []) as unknown as KalenderItem[]
}

export async function saveItem(p: {
  id?: string
  householdId: string
  datum: string
  tijd: string
  tz: string
  titel: string
  soort: EventKind
  emoji: string
  notitie: string
  persoonId: string | null
}) {
  const velden = {
    starts_at: zonedToUtc(p.datum, p.tijd, p.tz).toISOString(),
    title: p.titel,
    kind: p.soort,
    emoji: p.emoji || null,
    note: p.notitie || null,
    person_id: p.persoonId,
  }

  if (p.id) {
    const { error } = await supabase.from('agenda_event').update(velden).eq('id', p.id)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('agenda_event')
    .insert({ household_id: p.householdId, ...velden })
  if (error) throw error
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from('agenda_event').delete().eq('id', id)
  if (error) throw error
}
