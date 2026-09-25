import { supabase } from '../lib/supabase'
import { localDateKey } from '../lib/time'

export interface MedMoment {
  id: string
  naam: string
  due_at: string
  taken_at: string | null
  /** Voor de persoon: de doos herkennen zegt meer dan de naam lezen. */
  dosis: string | null
  instructie: string | null
  foto: string | null
}

/** De medicatiemomenten van vandaag, in de tijdzone van het huishouden. */
export async function getMedsToday(householdId: string, tz: string): Promise<MedMoment[]> {
  const nu = new Date()
  const { data, error } = await supabase
    .from('medication_log')
    .select('id, due_at, taken_at, medication(name, dose, instruction, photo_path)')
    .eq('household_id', householdId)
    .gte('due_at', new Date(nu.getTime() - 24 * 3600_000).toISOString())
    .lte('due_at', new Date(nu.getTime() + 24 * 3600_000).toISOString())
    .order('due_at')
  if (error) throw error

  const vandaag = localDateKey(nu, tz)
  type Med = { name: string; dose: string | null; instruction: string | null; photo_path: string | null }
  type Rij = {
    id: string
    due_at: string
    taken_at: string | null
    medication: Med | Med[] | null
  }
  return ((data ?? []) as Rij[])
    .filter((r) => localDateKey(new Date(r.due_at), tz) === vandaag)
    .map((r) => {
      const m = Array.isArray(r.medication) ? r.medication[0] : r.medication
      return {
        id: r.id,
        naam: m?.name ?? 'Medicatie',
        due_at: r.due_at,
        taken_at: r.taken_at,
        dosis: m?.dose ?? null,
        instructie: m?.instruction ?? null,
        foto: m?.photo_path ?? null,
      }
    })
}

export async function confirmMoments(ids: string[]) {
  for (const id of ids) {
    const { error } = await supabase.rpc('confirm_medication', { log_id: id, taken: true })
    if (error) throw error
  }
}
