import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
import { compressImage, extensionForImage } from '../lib/image'

/** De spullen van de bewoner (81). */
export interface Bezitting {
  id: string
  household_id: string
  naam: string
  soort: 'bril' | 'gebit' | 'hoorapparaat' | 'kleding' | 'sieraad' | 'hulpmiddel' | 'andere'
  kenmerk: string | null
  waar: string | null
  foto_path: string | null
  kwijt_sinds: string | null
  created_at: string
}

export interface KwijtOpAfdeling {
  id: string
  household_id: string
  bewoner: string
  kamer: string | null
  afdeling: string | null
  naam: string
  soort: Bezitting['soort']
  kenmerk: string | null
  waar: string | null
  kwijt_sinds: string
}

export const SOORTEN: { id: Bezitting['soort']; naam: string; emoji: string }[] = [
  { id: 'bril', naam: 'Bril', emoji: '👓' },
  { id: 'gebit', naam: 'Gebit', emoji: '🦷' },
  { id: 'hoorapparaat', naam: 'Hoorapparaat', emoji: '🦻' },
  { id: 'kleding', naam: 'Kleding', emoji: '👕' },
  { id: 'sieraad', naam: 'Sieraad', emoji: '💍' },
  { id: 'hulpmiddel', naam: 'Hulpmiddel', emoji: '🦯' },
  { id: 'andere', naam: 'Andere', emoji: '📦' },
]

export const emojiVan = (s: Bezitting['soort']) => SOORTEN.find((x) => x.id === s)?.emoji ?? '📦'

const BUCKET = 'memories'
const VELDEN = 'id, household_id, naam, soort, kenmerk, waar, foto_path, kwijt_sinds, created_at'

function ontbreekt(e: { code?: string } | null) {
  return !!e && (ontbrekendeFunctie(e) || ['42P01', 'PGRST205'].includes(e.code ?? ''))
}

export async function spullen(hh: string): Promise<Bezitting[]> {
  const { data, error } = await supabase.from('bezitting').select(VELDEN).eq('household_id', hh).order('soort').order('naam').limit(200)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as Bezitting[]
}

export async function nieuweBezitting(p: { hh: string; naam: string; soort: Bezitting['soort']; kenmerk?: string; waar?: string; auteur: string }): Promise<string> {
  const { data, error } = await supabase
    .from('bezitting')
    .insert({
      household_id: p.hh,
      naam: p.naam.trim(),
      soort: p.soort,
      kenmerk: p.kenmerk?.trim() || null,
      waar: p.waar?.trim() || null,
      created_by: p.auteur,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function uploadSpulFoto(hh: string, id: string, file: File): Promise<string> {
  const blob = await compressImage(file, 1600)
  const pad = `${hh}/spullen/${id}-${crypto.randomUUID()}.${extensionForImage(blob.type)}`
  const { error } = await supabase.storage.from(BUCKET).upload(pad, blob, { contentType: blob.type })
  if (error) throw error
  const { data: oud } = await supabase.from('bezitting').select('foto_path').eq('id', id).maybeSingle()
  const { error: fout } = await supabase.from('bezitting').update({ foto_path: pad }).eq('id', id)
  if (fout) {
    await supabase.storage.from(BUCKET).remove([pad])
    throw fout
  }
  // De vorige foto hoeft niet te blijven staan.
  const vorige = (oud as { foto_path: string | null } | null)?.foto_path
  if (vorige && vorige !== pad) await supabase.storage.from(BUCKET).remove([vorige])
  return pad
}

export async function wisBezitting(b: Pick<Bezitting, 'id' | 'foto_path'>) {
  const { data, error } = await supabase.from('bezitting').delete().eq('id', b.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Dit kan je niet wissen.')
  if (b.foto_path) await supabase.storage.from(BUCKET).remove([b.foto_path])
}

export async function meldKwijt(id: string) {
  const { error } = await supabase.rpc('meld_kwijt', { bezitting_id: id })
  if (error) throw error
}

export async function markeerGevonden(id: string) {
  const { error } = await supabase.rpc('markeer_gevonden', { bezitting_id: id })
  if (error) throw error
}

export async function kwijtOpAfdeling(org: string): Promise<KwijtOpAfdeling[]> {
  const { data, error } = await supabase.rpc('kwijt_op_afdeling', { org })
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as KwijtOpAfdeling[]
}

/** "sinds vanmorgen", "sinds gisteren", "sinds 3 dagen" (familie- en zorgscherm). */
export function sindsTekst(iso: string, nu: Date = new Date()): string {
  const uren = (nu.getTime() - new Date(iso).getTime()) / 3600_000
  if (uren < 1) return 'net gemeld'
  if (uren < 24) return `sinds ${Math.floor(uren)} uur`
  const dagen = Math.floor(uren / 24)
  return dagen === 1 ? 'sinds gisteren' : `sinds ${dagen} dagen`
}
