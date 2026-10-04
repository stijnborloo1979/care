import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'

/** Nieuws van het woonzorgcentrum (79): aan alle families of aan één afdeling. */
export interface NieuwsVoorFamilie {
  id: string
  titel: string
  tekst: string
  /** De naam van het woonzorgcentrum. */
  van: string
  /** De afdeling, als het bericht alleen voor die afdeling is. */
  afdeling: string | null
  created_at: string
}

export interface OrgNieuws {
  id: string
  org_id: string
  department_id: string | null
  titel: string
  tekst: string
  author_id: string | null
  created_at: string
}

function ontbreekt(e: { code?: string } | null) {
  return !!e && (ontbrekendeFunctie(e) || ['42P01', 'PGRST205'].includes(e.code ?? ''))
}

export async function nieuwsVoor(hh: string): Promise<NieuwsVoorFamilie[]> {
  const { data, error } = await supabase.rpc('nieuws_voor', { hh })
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as NieuwsVoorFamilie[]
}

export async function orgNieuws(org: string): Promise<OrgNieuws[]> {
  const { data, error } = await supabase
    .from('org_nieuws')
    .select('id, org_id, department_id, titel, tekst, author_id, created_at')
    .eq('org_id', org)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as OrgNieuws[]
}

export async function plaatsNieuws(p: { org_id: string; department_id: string | null; titel: string; tekst: string; auteur: string }) {
  const { error } = await supabase.from('org_nieuws').insert({
    org_id: p.org_id,
    department_id: p.department_id,
    titel: p.titel.trim(),
    tekst: p.tekst.trim(),
    author_id: p.auteur,
  })
  if (error) throw error
}

export async function wisNieuws(id: string) {
  const { data, error } = await supabase.from('org_nieuws').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Dit bericht kan je niet wissen.')
}

/** Nieuw = de laatste drie dagen. */
export function isNieuw(iso: string, nu: Date = new Date()): boolean {
  return nu.getTime() - new Date(iso).getTime() < 3 * 24 * 3600_000
}

/** "Van WZC Zonnehof · afdeling Linde" */
export function afzender(n: Pick<NieuwsVoorFamilie, 'van' | 'afdeling'>): string {
  return n.afdeling ? `Van ${n.van} · afdeling ${n.afdeling}` : `Van ${n.van}`
}

/** De afdelingen waar ik nu team lead ben: daar mag ik nieuws aan sturen. */
export async function mijnLeidAfdelingen(profiel: string): Promise<string[]> {
  const nu = new Date().toISOString()
  const { data, error } = await supabase
    .from('department_staff')
    .select('department_id, valid_from, valid_until')
    .eq('profile_id', profiel)
    .eq('role', 'team_lead')
    .lte('valid_from', nu)
  if (error) return []
  return ((data ?? []) as { department_id: string; valid_until: string | null }[])
    .filter((r) => !r.valid_until || r.valid_until > nu)
    .map((r) => r.department_id)
}
