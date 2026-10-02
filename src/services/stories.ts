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
  /** Waar de opname staat; ontbreekt vóór migratie 56 (dan 'messages'). */
  audio_bucket?: 'messages' | 'diary'
}

/** Vroeger: alle opnames in 'messages', map <hh>/verhalen/. */
const BUCKET = 'messages'
/** Vanaf migratie 56: een eigen bucket, pad <hh>/<bestand>. */
const DIARY = 'diary'

export function bucketVan(s: Pick<LifeStory, 'audio_bucket'>): string {
  return s.audio_bucket === 'diary' ? DIARY : BUCKET
}

/** De database kent de kolom audio_bucket nog niet (migratie 56 niet gedraaid). */
function zonderMigratie56(error: { code?: string; message?: string } | null): boolean {
  return (
    error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    (error?.message ?? '').includes('audio_bucket')
  )
}

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
  const { data: user } = await supabase.auth.getUser()
  // Het id terug, zodat de bewoner een fragment meteen privé kan zetten.
  const id = crypto.randomUUID()
  const rij = {
    id,
    household_id: p.householdId,
    question: p.vraag,
    body: p.tekst?.trim() || null,
    audio_seconds: p.seconden ?? null,
    shared: p.delen,
    created_by: user.user?.id,
    // Alleen meesturen als het een dagboek is: zo blijft "Vertel eens"
    // werken op een database zonder migratie 46.
    ...(p.soort === 'dagboek' ? { soort: 'dagboek', titel: p.titel ?? null } : {}),
  }

  const heeftOpname = !!(p.blob && p.mimeType)
  if (!heeftOpname) {
    const { error } = await supabase.from('life_story').insert({ ...rij, audio_path: null })
    if (error) throw error
    return id
  }

  // Vanaf 56: eerst het verhaal, dan de opname in de eigen bucket. De
  // opslag laat een opname alleen toe bij een verhaal dat al bestaat.
  const nieuwPad = `${p.householdId}/${crypto.randomUUID()}.${extensionFor(p.mimeType!)}`
  const { error: rijFout } = await supabase
    .from('life_story')
    .insert({ ...rij, audio_path: nieuwPad, audio_bucket: 'diary' })
  if (!rijFout) {
    const { error: upFout } = await supabase.storage
      .from(DIARY)
      .upload(nieuwPad, p.blob!, { contentType: p.mimeType })
    if (upFout) {
      await supabase.from('life_story').delete().eq('id', id)
      throw upFout
    }
    return id
  }
  if (!zonderMigratie56(rijFout)) throw rijFout

  // Zonder 56: zoals vroeger, eerst de opname in 'messages', dan het verhaal.
  // Het tweede padsegment is 'verhalen', niet 'family': daardoor mag de
  // persoon hier zelf schrijven, en blijven zorgverleners buiten.
  const oudPad = `${p.householdId}/verhalen/${crypto.randomUUID()}.${extensionFor(p.mimeType!)}`
  const { error: upFout } = await supabase.storage
    .from(BUCKET)
    .upload(oudPad, p.blob!, { contentType: p.mimeType })
  if (upFout) throw upFout
  const { error } = await supabase.from('life_story').insert({ ...rij, audio_path: oudPad })
  if (error) {
    await supabase.storage.from(BUCKET).remove([oudPad])
    throw error
  }
  return id
}

export async function setShared(id: string, shared: boolean) {
  const { error } = await supabase.from('life_story').update({ shared }).eq('id', id)
  if (error) throw error
}

export async function deleteStory(s: LifeStory) {
  if (s.audio_path) await supabase.storage.from(bucketVan(s)).remove([s.audio_path])
  const { error } = await supabase.from('life_story').delete().eq('id', s.id)
  if (error) throw error
}

/**
 * Een opname afspelen. Met het id van het verhaal loopt dat via de
 * database, zodat het gelogd wordt wanneer iemand anders dan de bewoner
 * luistert (migratie 55). Zonder die migratie: zoals vroeger.
 */
export async function storyAudioUrl(path: string, verhaalId?: string, bucket: string = BUCKET) {
  if (verhaalId) {
    const { data, error } = await supabase.rpc('open_verhaal_opname', { verhaal: verhaalId })
    if (error) {
      if (!ontbrekendeFunctie(error)) throw error
    } else if (data) {
      // Het pad van de database is het actuele, ook als de opname intussen
      // verhuisd is en deze lijst nog de oude rij toont. Daarom ook de
      // bucket uit het pad afleiden: <hh>/<bestand> staat in 'diary',
      // <hh>/verhalen/<bestand> in 'messages'.
      path = data as string
      bucket = bucketVoorPad(path)
    }
  }
  return signedUrl(bucket, path)
}

export function bucketVoorPad(pad: string): string {
  return pad.split('/').length === 2 ? DIARY : BUCKET
}
