import { supabase } from '../lib/supabase'

export * from './importPuur'

export interface ImportUitslag {
  rij: number
  naam: string
  status: 'ok' | 'fout' | 'overgeslagen'
  melding: string | null
  household_id: string | null
}

export async function importeerBewoners(
  org: string,
  rijen: { naam: string; afdeling: string; kamer: string }[],
  proef: boolean,
): Promise<ImportUitslag[]> {
  const { data, error } = await supabase.rpc('importeer_bewoners', { org, rijen, proef })
  if (error) throw error
  return (data ?? []) as ImportUitslag[]
}

/** De eerste familiebeheerder uitnodigen (84). Geeft de link terug. */
export async function nodigFamilieUit(hh: string, adres: string): Promise<string> {
  const { data, error } = await supabase.rpc('nodig_familie_uit', { hh, adres: adres.trim() })
  if (error) throw error
  const rij = (Array.isArray(data) ? data[0] : data) as { token: string }
  return `${window.location.origin}/uitnodiging?token=${rij.token}`
}

export interface FamilieStatus {
  household_id: string
  heeft_familie: boolean
  uitgenodigd: boolean
}

export async function familieStatus(org: string): Promise<FamilieStatus[]> {
  const { data, error } = await supabase.rpc('familie_status', { org })
  if (error) return []
  return (data ?? []) as FamilieStatus[]
}

// ---- Demo (85) -----------------------------------------------------------

export async function maakDemo(): Promise<string> {
  const { data, error } = await supabase.rpc('maak_demo_wzc')
  if (error) throw error
  return data as string
}

export async function demoRol(org: string, rol: 'org_admin' | 'coordinator') {
  const { error } = await supabase.rpc('demo_rol', { org, rol })
  if (error) throw error
}

export async function wisDemo(org: string) {
  const { error } = await supabase.rpc('wis_demo_wzc', { org })
  if (error) throw error
}

export async function isDemo(org: string): Promise<boolean> {
  const { data, error } = await supabase.from('organisation').select('demo').eq('id', org).maybeSingle()
  if (error) return false
  return !!(data as { demo?: boolean } | null)?.demo
}
