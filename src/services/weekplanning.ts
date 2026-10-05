import { supabase } from '../lib/supabase'
import type { VastMoment } from './afdelingsdagPuur'
import { uurKort } from './afdelingsdagPuur'

/** De week van het huis: de vaste dag (78) en de activiteiten (59). */
export interface WeekActiviteit {
  id: string
  department_id: string | null
  titel: string
  starts_at: string
  plaats: string | null
  status: 'gepland' | 'geannuleerd' | 'afgelopen'
}

export interface RoosterItem {
  sleutel: string
  tijd: string
  titel: string
  emoji: string | null
  soort: VastMoment['soort'] | 'activiteit'
  vast: boolean
  plaats: string | null
  department_id: string | null
  geannuleerd: boolean
}

export interface RoosterDag {
  datum: string
  weekdag: number
  items: RoosterItem[]
}

export async function activiteitenTussen(org: string, van: Date, tot: Date): Promise<WeekActiviteit[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('id, department_id, titel, starts_at, plaats, status')
    .eq('org_id', org)
    .gte('starts_at', van.toISOString())
    .lt('starts_at', tot.toISOString())
    .order('starts_at')
    .limit(500)
  if (error) throw error
  return (data ?? []) as WeekActiviteit[]
}

const p = (n: number) => String(n).padStart(2, '0')
const dagSleutel = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
/** Het huis rekent in Brusselse tijd, ook op een toestel met een andere klok. */
const TZ = 'Europe/Brussels'
const dagIn = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const uurIn = (d: Date) => new Intl.DateTimeFormat('nl-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

/** De maandag van de week waarin d valt (lokale tijd), om middernacht. */
export function maandagVan(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wd = (m.getDay() + 6) % 7
  m.setDate(m.getDate() - wd)
  return m
}

/**
 * Zeven dagen, met per dag de vaste momenten en de activiteiten, op uur.
 * afdeling: alleen wat voor die afdeling of het hele huis geldt; null = alles.
 */
export function weekRooster(maandag: Date, vast: VastMoment[], acts: WeekActiviteit[], afdeling: string | null): RoosterDag[] {
  const past = (dep: string | null) => afdeling === null || dep === null || dep === afdeling
  return Array.from({ length: 7 }, (_, i) => {
    const dag = new Date(maandag.getFullYear(), maandag.getMonth(), maandag.getDate() + i)
    const wd = i + 1
    const items: RoosterItem[] = [
      ...vast
        .filter((v) => v.actief && v.dagen.includes(wd) && past(v.department_id))
        .map((v) => ({
          sleutel: `v-${v.id}`,
          tijd: uurKort(v.begint),
          titel: v.titel,
          emoji: v.emoji,
          soort: v.soort,
          vast: true,
          plaats: null,
          department_id: v.department_id,
          geannuleerd: false,
        })),
      ...acts
        .filter((a) => dagIn(new Date(a.starts_at)) === dagSleutel(dag) && past(a.department_id))
        .map((a) => {
          return {
            sleutel: `a-${a.id}`,
            tijd: uurIn(new Date(a.starts_at)),
            titel: a.titel,
            emoji: null,
            soort: 'activiteit' as const,
            vast: false,
            plaats: a.plaats,
            department_id: a.department_id,
            geannuleerd: a.status === 'geannuleerd',
          }
        }),
    ].sort((x, y) => x.tijd.localeCompare(y.tijd) || Number(y.vast) - Number(x.vast))
    return { datum: dagSleutel(dag), weekdag: wd, items }
  })
}
