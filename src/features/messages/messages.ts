import { supabase } from '../../lib/supabase'
import { extensionFor } from './useVoiceRecorder'
import { compressImage, extensionForImage } from '../../lib/image'

export type Channel = 'family' | 'person'

export interface InboxMessage {
  id: string
  household_id: string
  author_name: string | null
  body: string | null
  audio_path: string | null
  audio_seconds: number | null
  photo_path: string | null
  pinned: boolean
  created_at: string
  seen: boolean
  /** Door de persoon zelf gezien — niet door wie nu kijkt. */
  seen_by_person: boolean
}

const BUCKET = 'messages'

/** Eén uur is ruim genoeg om af te spelen, en kort genoeg om te delen. */
export async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}

export async function sendVoiceMessage(opts: {
  householdId: string
  channel: Channel
  blob: Blob
  seconds: number
  mimeType: string
  body?: string
}): Promise<void> {
  const ext = extensionFor(opts.mimeType)
  // Het eerste padsegment is het huishouden, het tweede het kanaal.
  // Daar grijpen de storage-policies op aan: zet je dit anders in elkaar,
  // dan weigert Supabase de upload.
  const path = `${opts.householdId}/${opts.channel}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, opts.blob, { contentType: opts.mimeType, upsert: false })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('message').insert({
    household_id: opts.householdId,
    channel: opts.channel,
    body: opts.body ?? null,
    audio_path: path,
    audio_seconds: opts.seconds,
  })

  if (insertError) {
    // Anders blijft er een weesbestand achter dat niemand nog kan bereiken.
    await supabase.storage.from(BUCKET).remove([path])
    throw insertError
  }
}

/**
 * Een foto naar het scherm van de persoon, met een zin erbij. Voor de
 * kleinkinderen op het strand of de kaart uit Spanje: familie stuurt hem
 * van op afstand en hij staat bovenaan bij de berichten.
 */
export async function sendPhotoMessage(opts: {
  householdId: string
  channel: Channel
  file: File
  body?: string
}): Promise<void> {
  const blob = await compressImage(opts.file)
  const ext = extensionForImage(blob.type)
  // Huishouden en kanaal als eerste twee padsegmenten: daar grijpen de
  // storage-policies op aan.
  const path = `${opts.householdId}/${opts.channel}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false })
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('message').insert({
    household_id: opts.householdId,
    channel: opts.channel,
    body: opts.body?.trim() || null,
    photo_path: path,
  })

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path])
    throw insertError
  }
}

export async function sendTextMessage(householdId: string, channel: Channel, body: string) {
  const { error } = await supabase
    .from('message')
    .insert({ household_id: householdId, channel, body })
  if (error) throw error
}

export async function getPersonInbox(householdId: string): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from('person_inbox')
    .select('*')
    .eq('household_id', householdId)
  if (error) throw error
  return (data ?? []) as InboxMessage[]
}

export async function markRead(messageId: string) {
  const { error } = await supabase.rpc('mark_message_read', { msg: messageId })
  if (error) throw error
}

/**
 * Van het scherm van de persoon halen, zonder te verwijderen.
 *
 * Zij mag niets van familie wissen — maar op háár scherm moet ze wel
 * kunnen zeggen "gezien, dank je". De vervaldatum gaat op nu; het bericht
 * blijft voor familie bestaan zoals elk ander verlopen bericht.
 */
export async function hideMessage(messageId: string) {
  const { error } = await supabase.rpc('hide_message', { msg: messageId })
  if (error) throw error
}

/**
 * Echt weg: de rij én het bestand.
 *
 * Alleen wie het stuurde of een beheerder; dat handhaaft de policy op
 * message. Eerst de rij, dan het bestand — mislukt het bestand, dan is er
 * hoogstens een weesbestand in de opslag. Andersom zou er een bericht op
 * haar scherm staan dat naar een foto wijst die er niet meer is.
 */
export async function deleteMessage(m: Pick<InboxMessage, 'id' | 'photo_path' | 'audio_path'>) {
  const { error } = await supabase.from('message').delete().eq('id', m.id)
  if (error) throw error

  const paden = [m.photo_path, m.audio_path].filter((p): p is string => !!p)
  if (paden.length > 0) await supabase.storage.from('messages').remove(paden)
}

/**
 * De naam zoals je hem wil zien staan.
 *
 * Wie zich aanmeldt zonder naam op te geven, krijgt zijn e-mailadres als
 * naam — en dan staat er "Foto van borloo.stijn@telenet.be" op het scherm
 * van iemand met geheugenproblemen. Dat zegt haar niets.
 *
 * Geen gok over voor- en achternaam: we nemen wat vóór de @ staat, maken
 * er woorden van en zetten hoofdletters. Beter een benadering van een naam
 * dan een adres.
 */
export function toonNaam(naam: string | null | undefined): string {
  const ruw = (naam ?? '').trim()
  if (!ruw) return 'Familie'
  if (!ruw.includes('@')) return ruw

  const deel = ruw.split('@')[0].replace(/[._-]+/g, ' ').trim()
  if (!deel) return 'Familie'

  return deel
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
