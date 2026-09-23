import { supabase } from '../lib/supabase'

export type Herhaling = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Task {
  id: string
  household_id: string
  title: string
  note: string | null
  assignee: string | null
  due_on: string | null
  repeat: Herhaling
  done_at: string | null
  done_by: string | null
  created_at: string
}

export interface Familielid {
  profile_id: string
  naam: string
}

/** Openstaande taken, en wat de voorbije week afgevinkt werd. */
export async function getTasks(householdId: string): Promise<Task[]> {
  const week = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('task')
    .select('id, household_id, title, note, assignee, due_on, repeat, done_at, done_by, created_at')
    .eq('household_id', householdId)
    .or(`done_at.is.null,done_at.gte.${week}`)
    // Zonder datum onderaan: nulls last werkt hier als "ooit".
    .order('due_on', { ascending: true, nullsFirst: false })
    .limit(300)
  if (error) throw error
  return (data ?? []) as Task[]
}

/** Wie er taken kan opnemen: alleen familie, niet de persoon of een zorgverlener. */
export async function getFamilie(householdId: string): Promise<Familielid[]> {
  const { data, error } = await supabase
    .from('membership')
    .select('profile_id, role, profile:profile_id (full_name)')
    .eq('household_id', householdId)
    .in('role', ['admin', 'member'])
  if (error) throw error

  return (data ?? []).map((m) => {
    const p = m.profile as { full_name: string | null } | { full_name: string | null }[] | null
    const rij = Array.isArray(p) ? p[0] : p
    return { profile_id: m.profile_id as string, naam: rij?.full_name?.trim() || 'Naamloos' }
  })
}

export async function addTask(p: {
  householdId: string
  title: string
  note?: string
  assignee?: string | null
  dueOn?: string | null
  repeat?: Herhaling
}) {
  const { data: sessie } = await supabase.auth.getUser()
  const { error } = await supabase.from('task').insert({
    household_id: p.householdId,
    title: p.title.trim(),
    note: p.note?.trim() || null,
    assignee: p.assignee || null,
    due_on: p.dueOn || null,
    repeat: p.repeat ?? 'none',
    created_by: sessie.user?.id ?? null,
  })
  if (error) throw error
}

export async function claimTask(id: string) {
  const { error } = await supabase.rpc('claim_task', { t: id })
  if (error) throw error
}

export async function assignTask(id: string, wie: string | null) {
  const { error } = await supabase.rpc('assign_task', { t: id, wie })
  if (error) throw error
}

export async function completeTask(id: string) {
  const { error } = await supabase.rpc('complete_task', { t: id })
  if (error) throw error
}

export async function reopenTask(id: string) {
  const { error } = await supabase.rpc('reopen_task', { t: id })
  if (error) throw error
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('task').delete().eq('id', id)
  if (error) throw error
}
