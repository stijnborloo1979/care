import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'

export interface PersonCard {
  id: string
  household_id: string
  profile_id: string | null
  name: string
  relation: string
  description: string | null
  detail: string | null
  phone: string | null
  emoji: string | null
  color: string | null
  photo_path: string | null
  kind: 'self' | 'family' | 'contact' | 'care'
  sort: number
}

const BUCKET = 'avatars'

export async function getPeople(householdId: string): Promise<PersonCard[]> {
  const { data, error } = await supabase
    .from('person_card')
    .select(
      'id, household_id, profile_id, name, relation, description, detail, phone, emoji, color, photo_path, kind, sort',
    )
    .eq('household_id', householdId)
    .order('sort')
  if (error) throw error
  return (data ?? []) as PersonCard[]
}

export async function savePerson(p: {
  householdId: string
  id?: string
  name: string
  relation: string
  description: string
  detail: string
  phone: string
  kind: PersonCard['kind']
}): Promise<string> {
  const velden = {
    name: p.name,
    relation: p.relation,
    description: p.description || null,
    detail: p.detail || null,
    phone: p.phone || null,
    kind: p.kind,
  }

  if (p.id) {
    const { error } = await supabase.from('person_card').update(velden).eq('id', p.id)
    if (error) throw error
    return p.id
  }

  const { data, error } = await supabase
    .from('person_card')
    .insert({ household_id: p.householdId, ...velden })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deletePerson(id: string) {
  const { error } = await supabase.from('person_card').delete().eq('id', id)
  if (error) throw error
}

export async function uploadPersonPhoto(householdId: string, cardId: string, file: File) {
  const blob = await compressImage(file, 900)
  const ext = extensionForImage(blob.type)
  const path = `${householdId}/cards/${cardId}-${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type })
  if (error) throw error

  const { error: updateError } = await supabase
    .from('person_card')
    .update({ photo_path: path })
    .eq('id', cardId)
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw updateError
  }
  return path
}
