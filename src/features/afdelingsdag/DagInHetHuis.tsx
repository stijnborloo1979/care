import { CalendarDays } from 'lucide-react'
import { hhmm } from '../../lib/time'
import { useDagVanHuis } from '../today/useVandaag'
import type { HuisMoment } from '../../services/afdelingsdag'
import { tt } from '../../lib/uiTaal'

const DEELNAME: Record<NonNullable<HuisMoment['deelname']>, (naam: string) => string> = {
  ingeschreven: (naam) => tt('{naam} ingeschreven', { naam }),
  aanwezig: (naam) => tt('{naam} was erbij', { naam }),
  afwezig: (naam) => tt('{naam} was er niet bij', { naam }),
}

const EMOJI: Record<HuisMoment['soort'], string> = {
  maaltijd: '🍽️',
  rust: '🛋️',
  activiteit: '🎵',
  verzorging: '🛁',
  andere: '📌',
}

/**
 * De dag van de afdeling (78), voor de familie: wat het woonzorgcentrum
 * vandaag plande, en waar mama bij was. Thuis: niets.
 */
export default function DagInHetHuis({ householdId, personName, timezone }: { householdId: string; personName: string; timezone: string }) {
  const dag = useDagVanHuis(householdId, timezone)
  const lijst = dag.data ?? []
  if (lijst.length === 0) return null

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="huisdag-kop">
      <h2 id="huisdag-kop" className="flex items-center gap-2 text-lg font-bold">
        <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Vandaag in het woonzorgcentrum')}
      </h2>
      <ul className="mt-3 space-y-2">
        {lijst.map((m) => {
          const weg = m.status === 'geannuleerd'
          return (
            <li key={`${m.bron}-${m.id}`} className="flex items-baseline gap-3">
              <span className="w-14 shrink-0 whitespace-nowrap font-bold tabular-nums text-ink-soft">
                {hhmm(new Date(m.begint), timezone)}
              </span>
              <span className="min-w-0 flex-1">
                <span className={weg ? 'text-ink-faint line-through' : ''}>
                  <span aria-hidden="true">{m.emoji || EMOJI[m.soort]} </span>
                  {m.titel}
                </span>
                {m.plaats ? <span className="text-ink-soft"> · {m.plaats}</span> : null}
                {weg ? <span className="block text-sm text-ink-faint">{tt('gaat niet door')}</span> : null}
                {!weg && m.deelname ? (
                  <span className="block text-sm text-ink-soft">
                    {DEELNAME[m.deelname](personName)}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-sm text-ink-faint">{tt('Gepland door het woonzorgcentrum.')}</p>
    </section>
  )
}
