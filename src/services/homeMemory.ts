import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'
import { signedUrl } from '../lib/storage'

export interface Room {
  id: string
  household_id: string
  name: string
  emoji: string | null
  sort: number
}

export interface ItemStep {
  id: string
  item_id: string
  sort: number
  body: string
  photo_path: string | null
}

export interface Item {
  id: string
  household_id: string
  room_id: string
  name: string
  emoji: string | null
  where_text: string | null
  photo_path: string | null
  updated_at: string
}

export interface ItemWithSteps extends Item {
  item_step: ItemStep[]
}

const BUCKET = 'home-memory'

export async function getRooms(householdId: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from('room')
    .select('id, household_id, name, emoji, sort')
    .eq('household_id', householdId)
    .order('sort')
  if (error) throw error
  return (data ?? []) as Room[]
}

/** Alle items van het huishouden ineens: het zijn er tientallen, geen duizenden. */
export async function getItems(householdId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('item')
    .select('id, household_id, room_id, name, emoji, where_text, photo_path, updated_at')
    .eq('household_id', householdId)
    .order('sort')
  if (error) throw error
  return (data ?? []) as Item[]
}

export async function getItem(itemId: string): Promise<ItemWithSteps | null> {
  const { data, error } = await supabase
    .from('item')
    .select(
      'id, household_id, room_id, name, emoji, where_text, photo_path, updated_at, item_step(id, item_id, sort, body, photo_path)',
    )
    .eq('id', itemId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const rij = data as ItemWithSteps
  rij.item_step = (rij.item_step ?? []).slice().sort((a, b) => a.sort - b.sort)
  return rij
}

export async function saveItem(opts: {
  householdId: string
  roomId: string
  itemId?: string
  name: string
  emoji: string
  whereText: string
  steps: string[]
}): Promise<string> {
  let id = opts.itemId

  if (id) {
    const { error } = await supabase
      .from('item')
      .update({ name: opts.name, emoji: opts.emoji, where_text: opts.whereText })
      .eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('item')
      .insert({
        household_id: opts.householdId,
        room_id: opts.roomId,
        name: opts.name,
        emoji: opts.emoji,
        where_text: opts.whereText,
      })
      .select('id')
      .single()
    if (error) throw error
    id = (data as { id: string }).id
  }

  // Stappen worden in hun geheel vervangen. Ze zijn kort en de volgorde
  // is de inhoud; één stap verplaatsen is anders een hoop boekhouding.
  const { error: delError } = await supabase.from('item_step').delete().eq('item_id', id)
  if (delError) throw delError

  const rijen = opts.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((body, i) => ({ item_id: id, household_id: opts.householdId, sort: i, body }))

  if (rijen.length > 0) {
    const { error } = await supabase.from('item_step').insert(rijen)
    if (error) throw error
  }

  return id
}

export async function deleteItem(itemId: string) {
  const { error } = await supabase.from('item').delete().eq('id', itemId)
  if (error) throw error
}

export async function uploadItemPhoto(householdId: string, itemId: string, file: File) {
  const blob = await compressImage(file)
  const ext = extensionForImage(blob.type)
  const path = `${householdId}/items/${itemId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type })
  if (error) throw error

  const { error: updateError } = await supabase
    .from('item')
    .update({ photo_path: path })
    .eq('id', itemId)
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw updateError
  }

  return path
}

export async function photoUrl(path: string): Promise<string> {
  return signedUrl(BUCKET, path)
}
