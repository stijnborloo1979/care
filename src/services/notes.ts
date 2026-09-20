import { supabase } from '../lib/supabase'

export interface MemoryNote {
  id: string
  household_id: string
  category: string
  title: string
  body: string
  tags: string[]
}

export async function getNotes(householdId: string): Promise<MemoryNote[]> {
  const { data, error } = await supabase
    .from('memory_note')
    .select('id, household_id, category, title, body, tags')
    .eq('household_id', householdId)
    .order('category')
  if (error) throw error
  return (data ?? []) as MemoryNote[]
}

export const CATEGORIEEN = [
  { waarde: 'personen', label: 'Personen', emoji: '👥' },
  { waarde: 'plaatsen', label: 'Plaatsen', emoji: '📍' },
  { waarde: 'dingen', label: 'Dingen', emoji: '📦' },
  { waarde: 'voorkeuren', label: 'Voorkeuren', emoji: '💛' },
  { waarde: 'routines', label: 'Routines', emoji: '🔁' },
  { waarde: 'verhalen', label: 'Verhalen', emoji: '📖' },
] as const

export async function saveNote(p: {
  householdId: string
  id?: string
  category: string
  title: string
  body: string
  tags: string[]
}): Promise<string> {
  const velden = { category: p.category, title: p.title, body: p.body, tags: p.tags }

  if (p.id) {
    const { error } = await supabase.from('memory_note').update(velden).eq('id', p.id)
    if (error) throw error
    return p.id
  }

  const { data, error } = await supabase
    .from('memory_note')
    .insert({ household_id: p.householdId, ...velden })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from('memory_note').delete().eq('id', id)
  if (error) throw error
}
