import { supabase } from '../lib/supabase'

export interface RoutineStep {
  id: string
  routine_id: string
  at_time: string
  title: string
  emoji: string | null
  sort: number
}

export interface Routine {
  id: string
  household_id: string
  name: string
  emoji: string | null
  rrule: string
  active: boolean
  routine_step: RoutineStep[]
}

export const HERHALING: { waarde: string; label: string }[] = [
  { waarde: 'FREQ=DAILY', label: 'Elke dag' },
  { waarde: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdagen' },
  { waarde: 'FREQ=WEEKLY;BYDAY=SA,SU', label: 'Weekend' },
  { waarde: 'FREQ=WEEKLY;BYDAY=SU', label: 'Elke zondag' },
  { waarde: 'FREQ=MONTHLY;BYMONTHDAY=1', label: 'Eerste van de maand' },
]

export async function getRoutines(householdId: string): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routine')
    .select('id, household_id, name, emoji, rrule, active, routine_step(id, routine_id, at_time, title, emoji, sort)')
    .eq('household_id', householdId)
    .order('name')
  if (error) throw error
  return ((data ?? []) as Routine[]).map((r) => ({
    ...r,
    routine_step: (r.routine_step ?? []).slice().sort((a, b) => a.at_time.localeCompare(b.at_time)),
  }))
}

/** Stappen worden in hun geheel vervangen, net als bij Home Memory. */
export async function saveRoutine(p: {
  householdId: string
  id?: string
  name: string
  rrule: string
  active: boolean
  steps: { at: string; title: string }[]
}): Promise<string> {
  let id = p.id

  if (id) {
    const { error } = await supabase
      .from('routine')
      .update({ name: p.name, rrule: p.rrule, active: p.active })
      .eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('routine')
      .insert({ household_id: p.householdId, name: p.name, rrule: p.rrule, active: p.active })
      .select('id')
      .single()
    if (error) throw error
    id = (data as { id: string }).id
  }

  const { error: delError } = await supabase.from('routine_step').delete().eq('routine_id', id)
  if (delError) throw delError

  const rijen = p.steps
    .filter((s) => s.at && s.title.trim())
    .map((s, i) => ({
      routine_id: id,
      household_id: p.householdId,
      at_time: s.at,
      title: s.title.trim(),
      sort: i,
    }))

  if (rijen.length > 0) {
    const { error } = await supabase.from('routine_step').insert(rijen)
    if (error) throw error
  }

  return id
}

export async function deleteRoutine(id: string) {
  const { error } = await supabase.from('routine').delete().eq('id', id)
  if (error) throw error
}

/** Zet de routines van vandaag alsnog om in agenda-items. */
export async function materialiseToday(householdId: string) {
  const vandaag = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.rpc('materialise_day', { hh: householdId, on_day: vandaag })
  if (error) throw error
}
