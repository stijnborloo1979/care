import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'
import { signedUrl } from '../lib/storage'

export interface Room {
  id: string
  household_id: string
  name: string
  emoji: string | null
  /** Foto van de kamer. Op het scherm van de persoon vervangt die de emoji. */
  photo_path: string | null
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
    .select('id, household_id, name, emoji, photo_path, sort')
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
  //
  // De foto's mogen daar niet aan opgeofferd worden: wie de tekst van een
  // stap laat staan en alleen een stap bijschrijft, houdt zijn foto. We
  // onthouden ze per zin en zetten ze er weer bij.
  const { data: oudeStappen } = await supabase
    .from('item_step')
    .select('body, photo_path')
    .eq('item_id', id)

  const fotos = new Map<string, string>()
  for (const r of (oudeStappen ?? []) as { body: string; photo_path: string | null }[]) {
    if (r.photo_path) fotos.set(r.body.trim(), r.photo_path)
  }

  const { error: delError } = await supabase.from('item_step').delete().eq('item_id', id)
  if (delError) throw delError

  const rijen = opts.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((body, i) => ({
      item_id: id,
      household_id: opts.householdId,
      sort: i,
      body,
      photo_path: fotos.get(body) ?? null,
    }))

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

/**
 * Een foto bij een kamer. Wie de naam "berging" niet meer plaatst,
 * herkent de deur wel.
 */
export async function uploadRoomPhoto(householdId: string, roomId: string, file: File) {
  return await bewaarFoto(`${householdId}/rooms/${roomId}`, file, 'room', roomId)
}

/** Een foto bij één stap: "draai deze knop naar links". */
export async function uploadStepPhoto(householdId: string, stepId: string, file: File) {
  return await bewaarFoto(`${householdId}/steps/${stepId}`, file, 'item_step', stepId)
}

/**
 * Comprimeren, opslaan, en pas daarna het pad in de rij zetten. Mislukt
 * dat laatste, dan gaat het bestand weer weg: een bucket vol weesbestanden
 * is lastiger op te ruimen dan een foto die opnieuw gekozen moet worden.
 */
async function bewaarFoto(map: string, file: File, tabel: string, id: string) {
  const blob = await compressImage(file)
  const ext = extensionForImage(blob.type)
  const path = `${map}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type })
  if (error) throw error

  const { error: updateError } = await supabase.from(tabel).update({ photo_path: path }).eq('id', id)
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw updateError
  }

  return path
}
