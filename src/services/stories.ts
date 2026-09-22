import { supabase } from '../lib/supabase'
import { signedUrl } from '../lib/storage'
import { extensionFor } from '../features/messages/useVoiceRecorder'

export interface LifeStory {
  id: string
  household_id: string
  question: string
  body: string | null
  audio_path: string | null
  audio_seconds: number | null
  shared: boolean
  created_at: string
}

const BUCKET = 'messages'

export async function getStories(householdId: string): Promise<LifeStory[]> {
  const { data, error } = await supabase
    .from('life_story')
    .select('id, household_id, question, body, audio_path, audio_seconds, shared, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LifeStory[]
}

export async function addStory(p: {
  householdId: string
  vraag: string
  tekst?: string
  blob?: Blob
  seconden?: number
  mimeType?: string
  delen: boolean
}) {
  let audioPath: string | null = null

  if (p.blob && p.mimeType) {
    // Het tweede padsegment is 'verhalen', niet 'family': daardoor mag de
    // persoon hier zelf schrijven, en blijven zorgverleners buiten.
    audioPath = `${p.householdId}/verhalen/${crypto.randomUUID()}.${extensionFor(p.mimeType)}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(audioPath, p.blob, { contentType: p.mimeType })
    if (error) throw error
  }

  const { data: user } = await supabase.auth.getUser()
  const { error } = await supabase.from('life_story').insert({
    household_id: p.householdId,
    question: p.vraag,
    body: p.tekst?.trim() || null,
    audio_path: audioPath,
    audio_seconds: p.seconden ?? null,
    shared: p.delen,
    created_by: user.user?.id,
  })

  if (error) {
    if (audioPath) await supabase.storage.from(BUCKET).remove([audioPath])
    throw error
  }
}

export async function setShared(id: string, shared: boolean) {
  const { error } = await supabase.from('life_story').update({ shared }).eq('id', id)
  if (error) throw error
}

export async function deleteStory(s: LifeStory) {
  if (s.audio_path) await supabase.storage.from(BUCKET).remove([s.audio_path])
  const { error } = await supabase.from('life_story').delete().eq('id', s.id)
  if (error) throw error
}

export function storyAudioUrl(path: string) {
  return signedUrl(BUCKET, path)
}
