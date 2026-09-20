import { supabase } from '../lib/supabase'

export interface CareEntry {
  id: string
  household_id: string
  occurred_at: string
  title: string
  note: string | null
  source: 'family' | 'caregiver' | 'person' | 'system'
}

export async function getCareLog(householdId: string, dagen = 7): Promise<CareEntry[]> {
  const van = new Date(Date.now() - dagen * 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('care_log')
    .select('id, household_id, occurred_at, title, note, source')
    .eq('household_id', householdId)
    .gte('occurred_at', van)
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as CareEntry[]
}

export async function addCareEntry(p: {
  householdId: string
  occurredAt: string
  title: string
  note: string
}) {
  const { error } = await supabase.from('care_log').insert({
    household_id: p.householdId,
    occurred_at: p.occurredAt,
    title: p.title,
    note: p.note || null,
    source: 'family',
  })
  if (error) throw error
}

export async function deleteCareEntry(id: string) {
  const { error } = await supabase.from('care_log').delete().eq('id', id)
  if (error) throw error
}
