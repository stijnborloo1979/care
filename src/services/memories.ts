import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'

export interface MemoryPhoto {
  id: string
  household_id: string
  year: number | null
  taken_on: string | null
  title: string
  story: string | null
  photo_path: string | null
  created_at: string
}

const BUCKET = 'memories'

/** Op jaartal, oud naar nieuw: een leven leest van voor naar achter. */
export async function getPhotos(householdId: string): Promise<MemoryPhoto[]> {
  const { data, error } = await supabase
    .from('memory_photo')
    .select('id, household_id, year, taken_on, title, story, photo_path, created_at')
    .eq('household_id', householdId)
    .order('year', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as MemoryPhoto[]
}

export async function savePhoto(p: {
  householdId: string
  id?: string
  year: number | null
  title: string
  story: string
}): Promise<string> {
  const velden = { year: p.year, title: p.title, story: p.story || null }

  if (p.id) {
    const { error } = await supabase.from('memory_photo').update(velden).eq('id', p.id)
    if (error) throw error
    return p.id
  }

  const { data, error } = await supabase
    .from('memory_photo')
    .insert({ household_id: p.householdId, ...velden })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deletePhoto(id: string) {
  const { error } = await supabase.from('memory_photo').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPhoto(householdId: string, photoId: string, file: File) {
  const blob = await compressImage(file, 1800)
  const ext = extensionForImage(blob.type)
  const path = `${householdId}/photos/${photoId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type })
  if (error) throw error

  const { error: updateError } = await supabase
    .from('memory_photo')
    .update({ photo_path: path })
    .eq('id', photoId)
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw updateError
  }
  return path
}
