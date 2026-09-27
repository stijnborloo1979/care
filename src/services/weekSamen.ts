import { supabase } from '../lib/supabase'
import { localDateKey, plusDagen, zonedToUtc } from '../lib/time'
import type { EventKind } from './agenda'

/**
 * De week van iedereen voor wie je zorgt, op één scherm.
 *
 * De app kende de week al per huishouden (de kalender). Wat ontbrak is de
 * vraag waar het bellen over gaat: wie gaat er donderdag langs, en bij wie?
 * Wie voor twee ouders zorgt — of voor twee mensen die samenwonen — moest
 * daarvoor heen en weer wisselen tussen twee huishoudens, en dat is precies
 * het moment waarop je de telefoon neemt in plaats van de app.
 *
 * Twee mensen die samenwonen zijn in dit schema twee huishoudens, en dat is
 * met opzet: hun medicatie en hun dagindeling mogen nooit door elkaar lopen.
 * Alleen het overzicht hoort gedeeld te zijn, en dat is hier.
 */
export interface WeekItem {
  id: string
  household_id: string
  starts_at: string
  title: string
  emoji: string | null
  kind: EventKind
  done_at: string | null
  claimed_by: string | null
  opnemer: string | null
}

export interface WeekTaak {
  id: string
  household_id: string
  title: string
  due_on: string
  assignee: string | null
  done_at: string | null
}

export interface WeekDag {
  /** De datumsleutel, bijvoorbeeld 2026-09-27. */
  dag: string
  perPersoon: {
    household_id: string
    naam: string
    items: WeekItem[]
    taken: WeekTaak[]
    /** Komt er die dag niemand langs? Dat is de vraag die familie wil zien. */
    geenBezoek: boolean
  }[]
}

/**
 * Items en taken van één huishouden voor de week vanaf `maandag`.
 *
 * Bewust twee losse queries in plaats van een view: taken hangen aan een
 * datum (due_on) en agenda-items aan een tijdstip, en die twee in SQL
 * samenvoegen levert een rij op die geen van beide goed weergeeft.
 */
async function vanHuishouden(householdId: string, maandag: string, tz: string) {
  const van = zonedToUtc(maandag, '00:00', tz).toISOString()
  const tot = zonedToUtc(plusDagen(maandag, 7), '00:00', tz).toISOString()

  const [agenda, taken] = await Promise.all([
    supabase
      .from('agenda_event')
      .select(
        'id, household_id, starts_at, title, emoji, kind, done_at, claimed_by, opnemer:claimed_by (full_name)',
      )
      .eq('household_id', householdId)
      // Routines en maaltijden horen hier niet: dit scherm gaat over wat
      // familie moet regelen, niet over hoe de dag van de persoon loopt.
      .in('kind', ['visit', 'appt', 'other'])
      .gte('starts_at', van)
      .lt('starts_at', tot)
      .order('starts_at'),
    supabase
      .from('task')
      .select('id, household_id, title, due_on, assignee, done_at')
      .eq('household_id', householdId)
      .gte('due_on', maandag)
      .lt('due_on', plusDagen(maandag, 7))
      .order('due_on'),
  ])

  if (agenda.error) throw agenda.error
  if (taken.error) throw taken.error

  const items: WeekItem[] = (agenda.data ?? []).map((r) => {
    const rij = r as unknown as WeekItem & {
      opnemer: { full_name: string | null } | { full_name: string | null }[] | null
    }
    const wie = Array.isArray(rij.opnemer) ? rij.opnemer[0] : rij.opnemer
    return { ...rij, opnemer: wie?.full_name?.trim() || null }
  })

  return { items, taken: (taken.data ?? []) as WeekTaak[] }
}

/**
 * De hele week, voor elk huishouden dat je meegeeft.
 *
 * De huishoudens komen van buiten, want de app weet die al (useHouseholds) en
 * dit hoeft ze niet opnieuw op te halen.
 */
export async function getWeekSamen(
  huishoudens: { household_id: string; person_name: string; timezone: string }[],
  maandag: string,
): Promise<WeekDag[]> {
  const opgehaald = await Promise.all(
    huishoudens.map(async (h) => ({
      h,
      ...(await vanHuishouden(h.household_id, maandag, h.timezone)),
    })),
  )

  return Array.from({ length: 7 }, (_, i) => plusDagen(maandag, i)).map((dag) => ({
    dag,
    perPersoon: opgehaald.map(({ h, items, taken }) => {
      const vanDieDag = items.filter(
        (e) => localDateKey(new Date(e.starts_at), h.timezone) === dag,
      )
      return {
        household_id: h.household_id,
        naam: h.person_name.split(' ')[0] || h.person_name,
        items: vanDieDag,
        taken: taken.filter((t) => t.due_on === dag),
        geenBezoek: !vanDieDag.some((e) => e.kind === 'visit'),
      }
    }),
  }))
}

export async function neemOp(gebeurtenis: string) {
  const { error } = await supabase.rpc('neem_op', { gebeurtenis })
  if (error) throw error
}

export async function laatLos(gebeurtenis: string) {
  const { error } = await supabase.rpc('laat_los', { gebeurtenis })
  if (error) throw error
}

/** "Ik ga langs": maakt het bezoek en neemt het meteen op. */
export async function planBezoek(householdId: string, dag: string, uur = '14:00') {
  const { error } = await supabase.rpc('plan_bezoek', { hh: householdId, dag, uur })
  if (error) throw error
}
