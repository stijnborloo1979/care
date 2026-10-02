import { supabase } from '../../lib/supabase'
import { ontbrekendeFunctie } from '../../lib/ontbrekendeFunctie'

/** Berichten tussen de bewoner en zijn zorgteam (68). */
export interface BewonerBericht {
  id: string
  household_id: string
  van: 'bewoner' | 'team'
  body: string
  antwoord_op: string | null
  gezien_at: string | null
  created_at: string
}

const VELDEN = 'id, household_id, van, body, antwoord_op, gezien_at, created_at'

/** Het lopende verblijf, of null: geen WZC, of migratie 68 nog niet gedraaid. */
export async function lopendVerblijf(hh: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('lopend_verblijf', { hh })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return (data as string | null) ?? null
}

export async function berichtenVan(hh: string, aantal = 30): Promise<BewonerBericht[]> {
  const { data, error } = await supabase
    .from('resident_message')
    .select(VELDEN)
    .eq('household_id', hh)
    .order('created_at', { ascending: false })
    .limit(aantal)
  if (error) {
    if (ontbrekendeFunctie(error) || error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (data ?? []) as BewonerBericht[]
}

/** Voor het zorgteam: berichten die nog niemand zag, per bewoner. RLS beperkt tot mijn bewoners. */
export async function ongezien(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('resident_message')
    .select('household_id')
    .eq('van', 'bewoner')
    .is('gezien_at', null)
  if (error) return {}
  const telling: Record<string, number> = {}
  for (const r of (data ?? []) as { household_id: string }[]) telling[r.household_id] = (telling[r.household_id] ?? 0) + 1
  return telling
}

export async function stuurAanZorgteam(hh: string, tekst: string): Promise<string> {
  const { data, error } = await supabase.rpc('bericht_aan_zorgteam', { hh, tekst: tekst.trim() })
  if (error) throw error
  return data as string
}

export async function markeerGezien(bericht: string): Promise<void> {
  const { error } = await supabase.rpc('markeer_bericht_gezien', { bericht })
  if (error) throw error
}

export async function antwoordAanBewoner(bericht: string, tekst: string): Promise<void> {
  const { error } = await supabase.rpc('antwoord_aan_bewoner', { bericht, tekst: tekst.trim() })
  if (error) throw error
}

/** Bericht met zijn antwoorden, nieuwste eerst. */
export function draden(lijst: BewonerBericht[]): { vraag: BewonerBericht; antwoorden: BewonerBericht[] }[] {
  const antwoorden: Record<string, BewonerBericht[]> = {}
  for (const b of lijst)
    if (b.van === 'team' && b.antwoord_op) (antwoorden[b.antwoord_op] ??= []).push(b)
  return lijst
    .filter((b) => b.van === 'bewoner')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((vraag) => ({
      vraag,
      antwoorden: (antwoorden[vraag.id] ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
}
