import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'
import { afzender, isNieuw, nieuwsVoor } from '../../services/nieuws'
import { tt, uiLocale } from '../../lib/uiTaal'

/**
 * Nieuws van het woonzorgcentrum (79), in de familie-app. Altijd met de
 * afzender erbij: dit komt van het huis, niet van de familie en niet van
 * mama. Wie thuis woont, ziet hier niets.
 */
export default function NieuwsVanHetHuis({ householdId, timezone }: { householdId: string; timezone: string }) {
  const nieuws = useQuery({
    queryKey: ['nieuws-voor', householdId],
    queryFn: () => nieuwsVoor(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const [alles, setAlles] = useState(false)
  const lijst = nieuws.data ?? []
  if (lijst.length === 0) return null
  const getoond = alles ? lijst : lijst.slice(0, 2)
  const datum = new Intl.DateTimeFormat(uiLocale(), { timeZone: timezone, day: 'numeric', month: 'long' })

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="nieuws-kop">
      <h2 id="nieuws-kop" className="flex items-center gap-2 text-lg font-bold">
        <Megaphone size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Nieuws van {van}', { van: lijst[0].van })}
      </h2>
      <ul className="mt-3 space-y-4">
        {getoond.map((n) => (
          <li key={n.id} className="border-b border-line pb-4 last:border-none last:pb-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{n.titel}</span>
              {isNieuw(n.created_at) ? (
                <span className="rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-ink">
                  {tt('nieuw')}
                </span>
              ) : null}
            </p>
            <p className="mt-1 whitespace-pre-line text-ink">{n.tekst}</p>
            <p className="mt-1 text-sm text-ink-faint">
              {afzender(n)} · {datum.format(new Date(n.created_at))}
            </p>
          </li>
        ))}
      </ul>
      {lijst.length > 2 ? (
        <button
          onClick={() => setAlles(!alles)}
          aria-expanded={alles}
          className="mt-3 text-sm font-semibold text-accent-ink underline underline-offset-4"
        >
          {alles ? tt('Minder tonen') : tt('Alle {n} berichten', { n: lijst.length })}
        </button>
      ) : null}
    </section>
  )
}
