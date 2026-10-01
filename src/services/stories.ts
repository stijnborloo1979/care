import { supabase } from '../lib/supabase'
import { signedUrl } from '../lib/storage'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
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
  /** 'dagboek' voor LifeAngle Voice; ontbreekt vóór migratie 46. */
  soort?: 'verhaal' | 'dagboek'
  titel?: string | null
}

const BUCKET = 'messages'

/**
 * Met '*' in plaats van een kolomlijst: zo werkt dit ook op een database
 * waar migratie 46 (soort, titel) nog niet gedraaid is.
 */
export async function getStories(
  householdId: string,
  soort?: 'verhaal' | 'dagboek',
): Promise<LifeStory[]> {
  const { data, error } = await supabase
    .from('life_story')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const alle = (data ?? []) as LifeStory[]
  return soort ? alle.filter((s) => (s.soort ?? 'verhaal') === soort) : alle
}

export async function addStory(p: {
  householdId: string
  vraag: string
  tekst?: string
  blob?: Blob
  seconden?: number
  mimeType?: string
  delen: boolean
  soort?: 'verhaal' | 'dagboek'
  titel?: string
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
  // Het id terug, zodat de bewoner een fragment meteen privé kan zetten.
  const id = crypto.randomUUID()
  const { error } = await supabase.from('life_story').insert({
    id,
    household_id: p.householdId,
    question: p.vraag,
    body: p.tekst?.trim() || null,
    audio_path: audioPath,
    audio_seconds: p.seconden ?? null,
    shared: p.delen,
    created_by: user.user?.id,
    // Alleen meesturen als het een dagboek is: zo blijft "Vertel eens"
    // werken op een database zonder migratie 46.
    ...(p.soort === 'dagboek' ? { soort: 'dagboek', titel: p.titel ?? null } : {}),
  })

  if (error) {
    if (audioPath) await supabase.storage.from(BUCKET).remove([audioPath])
    throw error
  }
  return id
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

/**
 * Een opname afspelen. Met het id van het verhaal loopt dat via de
 * database, zodat het gelogd wordt wanneer iemand anders dan de bewoner
 * luistert (migratie 55). Zonder die migratie: zoals vroeger.
 */
export async function storyAudioUrl(path: string, verhaalId?: string) {
  if (verhaalId) {
    const { data, error } = await supabase.rpc('open_verhaal_opname', { verhaal: verhaalId })
    if (error) {
      if (!ontbrekendeFunctie(error)) throw error
    } else if (data) {
      path = data as string
    }
  }
  return signedUrl(BUCKET, path)
}
