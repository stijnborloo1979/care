import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'

export interface Medicijn {
  id: string
  household_id: string
  name: string
  dose: string | null
  at_time: string
  at_times: string[] | null
  instruction: string | null
  photo_path: string | null
  active: boolean
}

export function tijdenVan(m: Medicijn): string[] {
  return (m.at_times && m.at_times.length > 0 ? m.at_times : [m.at_time]).map((t) => t.slice(0, 5))
}

export async function getMedicijnen(householdId: string): Promise<Medicijn[]> {
  const { data, error } = await supabase
    .from('medication')
    .select('id, household_id, name, dose, at_time, at_times, instruction, photo_path, active')
    .eq('household_id', householdId)
    .order('active', { ascending: false })
    .order('name')
  if (error) throw error
  return (data ?? []) as Medicijn[]
}

/**
 * Bewaren en meteen het schema van vandaag en morgen bijwerken. Anders
 * verschijnt een nieuw medicijn pas na de nachtelijke job, en blijft een
 * gestopt medicijn tot morgen herinneringen geven.
 */
export async function saveMedicijn(p: {
  householdId: string
  id?: string
  naam: string
  dosis: string
  tijden: string[]
  instructie: string
  actief: boolean
}): Promise<string> {
  const tijden = [...new Set(p.tijden)].sort()
  const velden = {
    name: p.naam,
    dose: p.dosis || null,
    at_time: tijden[0],
    at_times: tijden,
    instruction: p.instructie || null,
    active: p.actief,
  }

  let id = p.id
  if (id) {
    const { error } = await supabase.from('medication').update(velden).eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('medication')
      .insert({ household_id: p.householdId, ...velden })
      .select('id')
      .single()
    if (error) throw error
    id = (data as { id: string }).id
  }

  const { error: syncFout } = await supabase.rpc('sync_medication_today', { hh: p.householdId })
  if (syncFout) throw syncFout
  return id
}

/** Verwijderen wist ook de geschiedenis. Stoppen is bijna altijd beter. */
export async function deleteMedicijn(householdId: string, id: string) {
  const { error } = await supabase.from('medication').delete().eq('id', id)
  if (error) throw error
  await supabase.rpc('sync_medication_today', { hh: householdId })
}

export async function uploadMedicijnFoto(householdId: string, id: string, file: File) {
  const blob = await compressImage(file, 1200)
  const path = `${householdId}/meds/${id}/${crypto.randomUUID()}.${extensionForImage(blob.type)}`
  const { error } = await supabase.storage
    .from('home-memory')
    .upload(path, blob, { contentType: blob.type })
  if (error) throw error
  const { error: upd } = await supabase.from('medication').update({ photo_path: path }).eq('id', id)
  if (upd) {
    await supabase.storage.from('home-memory').remove([path])
    throw upd
  }
}
