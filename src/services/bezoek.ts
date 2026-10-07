import { supabase } from '../lib/supabase'
import { compressImage, extensionForImage } from '../lib/image'
import { localDateKey } from '../lib/time'
import { locale, t } from '../lib/i18n'
import { tt } from '../lib/uiTaal'

/** "Wie was er hier?" (74): een bezoek dat de persoon niet kan vergeten. */
export interface Bezoek {
  id: string
  household_id: string
  visitor_name: string
  visitor_card: string | null
  note: string | null
  photo_path: string | null
  visited_at: string
  author_id: string | null
  created_at: string
}

const BUCKET = 'memories'
const VELDEN = 'id, household_id, visitor_name, visitor_card, note, photo_path, visited_at, author_id, created_at'

/** Ontbreekt de tabel nog (74 niet gedraaid), dan gewoon geen bezoeken. */
function ontbreekt(e: { code?: string } | null) {
  return !!e && ['42P01', 'PGRST205', 'PGRST202'].includes(e.code ?? '')
}

export async function recenteBezoeken(hh: string, dagen = 7): Promise<Bezoek[]> {
  const sinds = new Date(Date.now() - dagen * 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('visit_log')
    .select(VELDEN)
    .eq('household_id', hh)
    .gte('visited_at', sinds)
    .order('visited_at', { ascending: false })
    .limit(30)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as Bezoek[]
}

export async function legBezoekVast(p: {
  hh: string
  naam: string
  kaart?: string | null
  notitie?: string
  wanneer?: Date
  auteur: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('visit_log')
    .insert({
      household_id: p.hh,
      visitor_name: p.naam.trim(),
      visitor_card: p.kaart ?? null,
      note: p.notitie?.trim() || null,
      visited_at: (p.wanneer ?? new Date()).toISOString(),
      author_id: p.auteur,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function uploadBezoekFoto(hh: string, id: string, file: File): Promise<string> {
  const blob = await compressImage(file, 1600)
  const pad = `${hh}/bezoek/${id}-${crypto.randomUUID()}.${extensionForImage(blob.type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(pad, blob, { contentType: blob.type })
  if (error) throw error
  const { error: fout } = await supabase.from('visit_log').update({ photo_path: pad }).eq('id', id)
  if (fout) {
    await supabase.storage.from(BUCKET).remove([pad])
    throw fout
  }
  return pad
}

export async function wisBezoek(b: Pick<Bezoek, 'id' | 'photo_path'>): Promise<void> {
  const { data, error } = await supabase.from('visit_log').delete().eq('id', b.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error(tt('Dit bezoek kan je niet meer wissen.'))
  if (b.photo_path) await supabase.storage.from(BUCKET).remove([b.photo_path])
}

export const FOTO_BUCKET = BUCKET

// ---- Woorden ------------------------------------------------------------

function uurIn(d: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: 'numeric', hour12: false }).format(d)) % 24
}

/**
 * Wanneer, in gewone mensentaal: "vanmorgen", "gisteravond", "op zondag".
 * Nooit een datum of uur: dat is precies wat een vergeetachtig hoofd niet
 * vasthoudt, en ook niet nodig heeft. In de taal van het huishouden.
 */
export function wanneerTekst(iso: string, tz: string, nu: Date = new Date()): string {
  const d = new Date(iso)
  const dag = localDateKey(d, tz)
  const vandaag = localDateKey(nu, tz)
  const gisteren = localDateKey(new Date(nu.getTime() - 24 * 3600_000), tz)
  const u = uurIn(d, tz)
  const deel = u < 12 ? 'morgen' : u < 18 ? 'middag' : 'avond'
  if (dag === vandaag) return t(`bezoek.${deel}`)
  if (dag === gisteren) return t(`bezoek.gisteren${deel}`)
  return t('bezoek.op', { dag: new Intl.DateTimeFormat(locale(), { timeZone: tz, weekday: 'long' }).format(d) })
}

/** "Els was hier vanmiddag." */
export function bezoekZin(b: Pick<Bezoek, 'visitor_name' | 'visited_at'>, tz: string, nu: Date = new Date()): string {
  return t('bezoek.wasHier', { naam: b.visitor_name, wanneer: wanneerTekst(b.visited_at, tz, nu) })
}

/** Voor de tablet: de bezoeken van vandaag en gisteren, nieuwste eerst. */
export function voorDeTablet(lijst: Bezoek[], tz: string, nu: Date = new Date()): Bezoek[] {
  const vandaag = localDateKey(nu, tz)
  const gisteren = localDateKey(new Date(nu.getTime() - 24 * 3600_000), tz)
  return lijst
    .filter((b) => {
      const dag = localDateKey(new Date(b.visited_at), tz)
      return (dag === vandaag || dag === gisteren) && new Date(b.visited_at).getTime() <= nu.getTime() + 5 * 60_000
    })
    .sort((a, b) => b.visited_at.localeCompare(a.visited_at))
}
