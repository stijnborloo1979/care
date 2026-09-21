import { supabase } from '../lib/supabase'

export interface QuickNote {
  id: string
  household_id: string
  body: string
  created_at: string
}

export async function getQuickNotes(householdId: string): Promise<QuickNote[]> {
  const { data, error } = await supabase
    .from('quick_note')
    .select('id, household_id, body, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as QuickNote[]
}

export async function addQuickNote(householdId: string, body: string) {
  const { data: user } = await supabase.auth.getUser()
  const { error } = await supabase.from('quick_note').insert({
    household_id: householdId,
    body: body.trim(),
    created_by: user.user?.id,
  })
  if (error) throw error
}

export async function deleteQuickNote(id: string) {
  const { error } = await supabase.from('quick_note').delete().eq('id', id)
  if (error) throw error
}
