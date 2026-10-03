import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Check, Share2 } from 'lucide-react'
import type { Summary } from '../../services/dashboard'
import { recenteBezoeken } from '../../services/bezoek'
import { dagverhaal } from './dagverhaal'
import { useDagVanHuis } from '../today/useVandaag'

/** De dag van mama in een paar zinnen, om te lezen of door te sturen. */
export default function DagVerhaal({
  householdId,
  personName,
  timezone,
  summary,
}: {
  householdId: string
  personName: string
  timezone: string
  summary: Summary
}) {
  const bezoeken = useQuery({
    queryKey: ['bezoeken', householdId, 7],
    queryFn: () => recenteBezoeken(householdId, 7),
    enabled: !!householdId,
    retry: false,
  })
  const huis = useDagVanHuis(householdId, timezone)
  const [gedeeld, setGedeeld] = useState(false)
  const { zinnen, logboek } = dagverhaal({
    naam: personName,
    summary,
    bezoeken: bezoeken.data ?? [],
    huis: huis.data ?? [],
    tz: timezone,
  })
  const tekst = `De dag van ${personName}\n\n${zinnen.join('\n')}`

  async function deel() {
    try {
      if (navigator.share) await navigator.share({ text: tekst })
      else await navigator.clipboard?.writeText(tekst)
      setGedeeld(true)
    } catch {
      // geannuleerd: niets te doen
    }
  }

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="dagverhaal-kop">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="dagverhaal-kop" className="flex items-center gap-2 text-lg font-bold">
          <BookOpen size={20} strokeWidth={1.75} aria-hidden="true" /> De dag van {personName}
        </h2>
        <button
          onClick={deel}
          className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-pill border-[1.5px] border-line-strong px-4 text-sm font-semibold"
        >
          {gedeeld ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <Share2 size={16} strokeWidth={1.75} aria-hidden="true" />}
          {gedeeld ? 'Klaar om te plakken' : 'Doorsturen'}
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-lg leading-relaxed">
        {zinnen.map((z, i) => (
          <p key={i}>{z}</p>
        ))}
      </div>
      {logboek.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-surface-soft p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Zelf geschreven vandaag</h3>
          <ul className="mt-1 space-y-1">
            {logboek.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">Dit wordt niet mee doorgestuurd.</p>
        </div>
      ) : null}
      <p className="mt-3 text-sm text-ink-faint">Alleen wat in de app staat. Geen beoordeling van de gezondheid.</p>
    </section>
  )
}
