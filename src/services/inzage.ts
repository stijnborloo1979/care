import { supabase } from '../lib/supabase'

/**
 * Wie bekeek wat (migratie 55) en noodtoegang (migratie 54).
 *
 * Alles is tolerant voor een database waar die migraties nog niet gedraaid
 * zijn: dan is er gewoon niets te tonen, geen fout.
 */

export type InzageSoort = 'document' | 'life_story' | 'location_point'

export interface Inzage {
  id: number
  actor_id: string | null
  soort: InzageSoort
  row_id: string | null
  at: string
  rol: string | null
}

export interface Noodtoegang {
  id: string
  profile_id: string
  reason: string
  started_at: string
  expires_at: string
  ended_at: string | null
  inzages: number
}

const SOORTEN: InzageSoort[] = ['document', 'life_story', 'location_point']

/** Tabel of functie bestaat (nog) niet: niets tonen. */
function ontbreekt(error: { code?: string; message?: string } | null): boolean {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    error?.code === 'PGRST202' ||
    (error?.message ?? '').includes('does not exist') ||
    (error?.message ?? '').includes('Could not find')
  )
}

export async function getInzages(hh: string, dagen = 30): Promise<Inzage[]> {
  const sinds = new Date(Date.now() - dagen * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('household_id', hh)
    .eq('action', 'inzage')
    .gte('at', sinds)
    .order('at', { ascending: false })
    .limit(200)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? [])
    .filter((r) => SOORTEN.includes(r.table_name as InzageSoort))
    .map((r) => ({
      id: r.id as number,
      actor_id: (r.actor_id as string | null) ?? null,
      soort: r.table_name as InzageSoort,
      row_id: (r.row_id as string | null) ?? null,
      at: r.at as string,
      rol: ((r.detail as { rol?: string } | null)?.rol as string | undefined) ?? null,
    }))
}

/** Namen van mensen die het huishouden mag zien; anderen blijven onbekend. */
export async function getNamen(ids: string[]): Promise<Record<string, string>> {
  const uniek = [...new Set(ids)].filter(Boolean)
  if (uniek.length === 0) return {}
  const { data } = await supabase.from('profile').select('id, full_name').in('id', uniek)
  const namen: Record<string, string> = {}
  for (const p of data ?? []) {
    const naam = (p.full_name as string | null)?.trim()
    if (naam) namen[p.id as string] = naam
  }
  return namen
}

/** De naam van een document en de titel van een verhaal, als je ze mag zien. */
export async function getOnderwerpen(inzages: Inzage[]): Promise<Record<string, string>> {
  const docs = inzages.filter((i) => i.soort === 'document' && i.row_id).map((i) => i.row_id!)
  const verhalen = inzages.filter((i) => i.soort === 'life_story' && i.row_id).map((i) => i.row_id!)
  const uit: Record<string, string> = {}
  if (docs.length) {
    const { data } = await supabase.from('document').select('id, name').in('id', [...new Set(docs)])
    for (const d of data ?? []) uit[d.id as string] = d.name as string
  }
  if (verhalen.length) {
    const { data } = await supabase.from('life_story').select('*').in('id', [...new Set(verhalen)])
    for (const v of data ?? []) {
      uit[v.id as string] = ((v.titel as string | null) || (v.question as string)) ?? ''
    }
  }
  return uit
}

export async function getNoodtoegangen(hh: string): Promise<Noodtoegang[]> {
  const { data, error } = await supabase
    .from('emergency_access')
    .select('id, profile_id, reason, started_at, expires_at, ended_at')
    .eq('household_id', hh)
    .order('started_at', { ascending: false })
    .limit(20)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  const rijen = data ?? []
  if (rijen.length === 0) return []

  const { data: log } = await supabase
    .from('emergency_access_log')
    .select('access_id, action')
    .in('access_id', rijen.map((r) => r.id as string))
    .eq('action', 'inzage')
  const tel: Record<string, number> = {}
  for (const l of log ?? []) tel[l.access_id as string] = (tel[l.access_id as string] ?? 0) + 1

  return rijen.map((r) => ({
    id: r.id as string,
    profile_id: r.profile_id as string,
    reason: r.reason as string,
    started_at: r.started_at as string,
    expires_at: r.expires_at as string,
    ended_at: (r.ended_at as string | null) ?? null,
    inzages: tel[r.id as string] ?? 0,
  }))
}

export async function stopNoodtoegang(id: string) {
  const { error } = await supabase.rpc('stop_noodtoegang', { a_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------
//  In gewone taal
// ---------------------------------------------------------------------

const ROLNAAM: Record<string, string> = {
  admin: 'Een familiebeheerder',
  member: 'Een familielid',
  caregiver: 'Een zorgverlener',
  person: 'De tablet',
}

export function wie(i: Pick<Inzage, 'actor_id' | 'rol'>, namen: Record<string, string>): string {
  if (i.actor_id && namen[i.actor_id]) return namen[i.actor_id]
  return (i.rol && ROLNAAM[i.rol]) || 'Iemand'
}

export function watZin(i: Pick<Inzage, 'soort' | 'row_id'>, onderwerpen: Record<string, string>): string {
  const naam = i.row_id ? onderwerpen[i.row_id] : undefined
  switch (i.soort) {
    case 'document':
      return naam ? `opende het document „${naam}”` : 'opende een document'
    case 'life_story':
      return naam ? `beluisterde „${naam}”` : 'beluisterde een opname'
    case 'location_point':
      return 'bekeek de locatie'
  }
}

/** Per dag, nieuwste eerst: [['Vandaag', [...]], ['Gisteren', [...]], ['maandag 28 september', [...]]] */
export function perDag<T extends { at: string }>(rijen: T[], nu = new Date()): [string, T[]][] {
  const dag = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const vandaag = dag(nu)
  const groepen = new Map<string, T[]>()
  for (const r of rijen) {
    const d = new Date(r.at)
    const verschil = Math.round((vandaag - dag(d)) / 86_400_000)
    const label =
      verschil === 0
        ? 'Vandaag'
        : verschil === 1
          ? 'Gisteren'
          : d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!groepen.has(label)) groepen.set(label, [])
    groepen.get(label)!.push(r)
  }
  return [...groepen.entries()]
}

export type NoodStatus = 'loopt' | 'gestopt' | 'verlopen'

export function noodStatus(n: Pick<Noodtoegang, 'ended_at' | 'expires_at'>, nu = new Date()): NoodStatus {
  if (n.ended_at) return 'gestopt'
  return new Date(n.expires_at).getTime() > nu.getTime() ? 'loopt' : 'verlopen'
}
