import { supabase } from '../../lib/supabase'
import { beginHuidigeDienst, maakConcept, type Invoer, type Regel } from './overdrachtConcept'

/** Staat de concept-overdracht aan voor deze organisatie? Standaard uit. */
export async function conceptAan(org: string): Promise<boolean> {
  const { data, error } = await supabase.from('organisation').select('concept_overdracht').eq('id', org).maybeSingle()
  if (error) return false
  return !!(data as { concept_overdracht?: boolean } | null)?.concept_overdracht
}

/**
 * Haalt de bronnen op voor één afdeling en geeft het concept terug.
 * Alles wordt gelezen met de rechten van de gebruiker: wat RLS verbergt,
 * komt niet in het concept.
 */
export async function conceptVoorAfdeling(org: string, afdeling: string, nu = new Date()): Promise<Regel[]> {
  const sinds = beginHuidigeDienst(nu).toISOString()

  const [notities, verblijven, activiteiten, taken] = await Promise.all([
    supabase
      .from('care_note')
      .select('id, body, category, created_at, vervangt, stay:stay_id (department_id, room)')
      .eq('org_id', org)
      .gte('created_at', sinds)
      .order('created_at'),
    supabase
      .from('stay')
      .select('id, room, started_at')
      .eq('org_id', org)
      .eq('department_id', afdeling)
      .is('ended_at', null)
      .gte('started_at', sinds),
    supabase
      .from('activity')
      .select('id, titel, starts_at, plaats, status')
      .eq('org_id', org)
      .eq('department_id', afdeling)
      .gte('starts_at', sinds)
      .order('starts_at'),
    supabase
      .from('zorg_taak')
      .select('id, title, note, due_on, created_at, stay:stay_id (room)')
      .eq('org_id', org)
      .eq('department_id', afdeling)
      .is('done_at', null)
      .order('created_at'),
  ])
  for (const r of [notities, verblijven, activiteiten, taken]) if (r.error) throw r.error

  type NoteRij = {
    id: string
    body: string
    category: string
    created_at: string
    vervangt: string | null
    stay: { department_id: string | null; room: string | null } | null
  }

  const invoer: Invoer = {
    sinds,
    notities: ((notities.data ?? []) as unknown as NoteRij[])
      .filter((n) => n.stay?.department_id === afdeling)
      .map((n) => ({
        id: n.id,
        body: n.body,
        category: n.category,
        created_at: n.created_at,
        kamer: n.stay?.room ?? null,
        vervangt: n.vervangt,
      })),
    nieuweVerblijven: ((verblijven.data ?? []) as { id: string; room: string | null; started_at: string }[]).map((v) => ({
      id: v.id,
      kamer: v.room,
      started_at: v.started_at,
    })),
    activiteiten: ((activiteiten.data ?? []) as { id: string; titel: string; starts_at: string; plaats: string | null; status: string }[]),
    taken: ((taken.data ?? []) as unknown as {
      id: string
      title: string
      note: string | null
      due_on: string | null
      created_at: string
      stay: { room: string | null } | null
    }[]).map((t) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      due_on: t.due_on,
      created_at: t.created_at,
      kamer: t.stay?.room ?? null,
    })),
  }

  return maakConcept(invoer)
}
