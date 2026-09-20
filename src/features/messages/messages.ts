import { supabase } from '../../lib/supabase'
import { extensionFor } from './useVoiceRecorder'

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
