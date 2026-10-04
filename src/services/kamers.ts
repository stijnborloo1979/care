import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
import type { Bezetting, Kamer } from './kamersPuur'

export * from './kamersPuur'

function ontbreekt(e: { code?: string } | null) {
  return !!e && (ontbrekendeFunctie(e) || ['42P01', 'PGRST205'].includes(e.code ?? ''))
}

export async function kamers(org: string): Promise<Kamer[]> {
  const { data, error } = await supabase
    .from('kamer')
    .select('id, org_id, department_id, naam, bedden, actief, notitie')
    .eq('org_id', org)
    .limit(1000)
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as Kamer[]
}

export async function bezetting(org: string): Promise<Bezetting[]> {
  const { data, error } = await supabase.rpc('bezetting', { org })
  if (error) {
    if (ontbreekt(error)) return []
    throw error
  }
  return (data ?? []) as Bezetting[]
}

export async function nieuweKamers(org: string, afdeling: string, namen: string[], bedden: number) {
  const rijen = namen.map((naam) => ({ org_id: org, department_id: afdeling, naam: naam.trim(), bedden })).filter((r) => r.naam)
  if (rijen.length === 0) return
  const { error } = await supabase.from('kamer').insert(rijen)
  if (error) throw error
}

export async function wijzigKamer(id: string, p: Partial<Pick<Kamer, 'bedden' | 'actief' | 'notitie'>>) {
  const { data, error } = await supabase.from('kamer').update(p).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder of een coördinator past kamers aan.')
}

export async function wisKamer(id: string) {
  const { data, error } = await supabase.from('kamer').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder of een coördinator wist kamers.')
}

/** "1-12" of "101, 102, 105" → losse kamernamen. Hoogstens 200. */
export function kamerReeks(invoer: string): string[] {
  const uit: string[] = []
  for (const deel of invoer.split(/[,;\n]/)) {
    const d = deel.trim()
    const m = d.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])]
      if (b >= a && b - a < 200) for (let i = a; i <= b; i++) uit.push(String(i))
    } else if (d) uit.push(d.slice(0, 20))
  }
  return [...new Set(uit)].slice(0, 200)
}
