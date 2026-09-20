import { supabase } from '../lib/supabase'
import { localDateKey } from '../lib/time'
import { getToday, type AgendaEvent } from './agenda'

export interface MedStatus {
  id: string
  name: string
  dose: string | null
  due_at: string
  taken_at: string | null
}

export interface CareEntry {
  id: string
  occurred_at: string
  title: string
  note: string | null
  source: string
}

export interface Alert {
  id: string
  level: string
  body: string
  created_at: string
}

export interface Summary {
  events: AgendaEvent[]
  meds: MedStatus[]
  log: CareEntry[]
  alerts: Alert[]
}

export async function getSummary(householdId: string, tz: string): Promise<Summary> {
  const nu = new Date()
  const van = new Date(nu.getTime() - 24 * 3600_000).toISOString()
  const tot = new Date(nu.getTime() + 24 * 3600_000).toISOString()
  const vandaag = localDateKey(nu, tz)

  const [events, medRes, logRes, alertRes] = await Promise.all([
    getToday(householdId, tz),
    supabase
      .from('medication_log')
      .select('id, due_at, taken_at, medication(name, dose)')
      .eq('household_id', householdId)
      .gte('due_at', van)
      .lte('due_at', tot)
      .order('due_at'),
    supabase
      .from('care_log')
      .select('id, occurred_at, title, note, source')
      .eq('household_id', householdId)
      .gte('occurred_at', van)
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase
      .from('notification')
      .select('id, level, body, created_at')
      .eq('household_id', householdId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (medRes.error) throw medRes.error
  if (logRes.error) throw logRes.error
  if (alertRes.error) throw alertRes.error

  type MedRow = {
    id: string
    due_at: string
    taken_at: string | null
    medication: { name: string; dose: string | null } | { name: string; dose: string | null }[] | null
  }

  const meds: MedStatus[] = ((medRes.data ?? []) as MedRow[])
    .filter((m) => localDateKey(new Date(m.due_at), tz) === vandaag)
    .map((m) => {
      const med = Array.isArray(m.medication) ? m.medication[0] : m.medication
      return {
        id: m.id,
        name: med?.name ?? 'Medicatie',
        dose: med?.dose ?? null,
        due_at: m.due_at,
        taken_at: m.taken_at,
      }
    })

  const log = ((logRes.data ?? []) as CareEntry[]).filter(
    (l) => localDateKey(new Date(l.occurred_at), tz) === vandaag,
  )

  return { events, meds, log, alerts: (alertRes.data ?? []) as Alert[] }
}

export async function confirmMedication(logId: string, taken = true) {
  const { error } = await supabase.rpc('confirm_medication', { log_id: logId, taken })
  if (error) throw error
}

export async function dismissAlert(id: string) {
  const { error } = await supabase
    .from('notification')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
