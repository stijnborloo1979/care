import { supabase } from './supabase'

/** Alle buckets zijn privé, dus elk bestand heeft een tijdelijke link nodig. */
export async function signedUrl(bucket: string, path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}
