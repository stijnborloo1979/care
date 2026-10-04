import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { useOrganisatie } from './useOrganisatie'
import { afdelingen as haalAfdelingen } from './zorgApi'
import { vasteDag } from '../../services/afdelingsdag'
import { activiteitenTussen, maandagVan, weekRooster } from '../../services/weekplanning'
import { Fout, Kaart, Kop, Laden, knopKlein, label, veld } from './ui'

const EMOJI: Record<string, string> = { maaltijd: '🍽️', rust: '🛋️', activiteit: '🎵', verzorging: '🛁', andere: '📌' }
const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

/**
 * De week van het huis: vaste dag en activiteiten, per afdeling. Om op een
 * scherm te bekijken of af te drukken voor op de gang.
 */
export default function Weekplanning() {
  const { org } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const [maandag, setMaandag] = useState(() => maandagVan(new Date()))
  const [afdeling, setAfdeling] = useState('')
  const zondagNa = new Date(maandag.getFullYear(), maandag.getMonth(), maandag.getDate() + 7)

  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const vast = useQuery({ queryKey: ['zorg', 'vaste-dag', orgId], queryFn: () => vasteDag(orgId), enabled: !!orgId })
  const acts = useQuery({
    queryKey: ['zorg', 'week', orgId, maandag.toISOString()],
    queryFn: () => activiteitenTussen(orgId, maandag, zondagNa),
    enabled: !!orgId,
  })
  if (!org) return null

  const namen = Object.fromEntries((afd.data ?? []).map((a) => [a.id, a.name]))
  const rooster = weekRooster(maandag, vast.data ?? [], acts.data ?? [], afdeling || null)
  const vandaag = new Date().toDateString()
  const fmt = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long' })
  const verschuif = (dagen: number) => setMaandag(new Date(maandag.getFullYear(), maandag.getMonth(), maandag.getDate() + dagen))
  const leeg = rooster.every((d) => d.items.length === 0)

  return (
    <div className="space-y-6 weekplanning">
      <div className="print:hidden">
        <Kop
          titel="Weekplanning"
          uitleg="De vaste dag en de activiteiten van het huis. Wat hier staat, staat ook op de tablets."
          rechts={
            <button onClick={() => window.print()} className={`${knopKlein} inline-flex items-center gap-2`}>
              <Printer size={16} strokeWidth={1.75} aria-hidden="true" /> Afdrukken
            </button>
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex items-center gap-1">
          <button onClick={() => verschuif(-7)} aria-label="Vorige week" className={knopKlein}>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button onClick={() => setMaandag(maandagVan(new Date()))} className={knopKlein}>
            Deze week
          </button>
          <button onClick={() => verschuif(7)} aria-label="Volgende week" className={knopKlein}>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <label className="min-w-[12rem]">
          <span className={label}>Afdeling</span>
          <select value={afdeling} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
            <option value="">Alle afdelingen</option>
            {(afd.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="text-xl font-bold">
        {org.naam}
        {afdeling ? ` · afdeling ${namen[afdeling] ?? ''}` : ''} — week van {fmt.format(maandag)}
      </h2>

      {vast.isLoading || acts.isLoading ? <Laden /> : null}
      <Fout fout={vast.error ?? acts.error} />
      {leeg && !vast.isLoading && !acts.isLoading ? (
        <Kaart>
          <p className="text-ink-soft">
            Er staat deze week nog niets. Vul bij Activiteiten de vaste dag in (ontbijt, middagmaal, rust) en plan activiteiten.
          </p>
        </Kaart>
      ) : null}

      {!leeg ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-7 print:gap-1">
          {rooster.map((d, i) => {
            const datum = new Date(d.datum + 'T12:00:00')
            const isVandaag = datum.toDateString() === vandaag
            return (
              <section
                lang="nl"
                key={d.datum}
                className={`min-w-0 rounded-card bg-surface p-3 shadow-card print:rounded-none print:border print:border-line print:p-1 print:shadow-none ${isVandaag ? 'ring-2 ring-accent' : ''}`}
                aria-label={`${DAGEN[i]} ${fmt.format(datum)}`}
              >
                <h3 className="font-bold">
                  {DAGEN[i]}
                  <span className="block text-sm font-normal text-ink-soft">
                    {fmt.format(datum)}
                    {isVandaag ? ' · vandaag' : ''}
                  </span>
                </h3>
                {d.items.length === 0 ? <p className="mt-2 text-sm text-ink-faint">Niets gepland</p> : null}
                <ul className="mt-2 space-y-1.5">
                  {d.items.map((it) => (
                    <li
                      key={it.sleutel}
                      className={`rounded-xl px-2 py-1.5 text-sm [hyphens:auto] ${it.vast ? 'bg-surface-soft' : 'bg-accent-soft'} ${it.geannuleerd ? 'opacity-60' : ''}`}
                    >
                      <span className="font-bold tabular-nums">{it.tijd}</span>{' '}
                      <span aria-hidden="true">{it.emoji || EMOJI[it.soort]}</span>{' '}
                      <span className={it.geannuleerd ? 'line-through' : 'font-semibold'}>{it.titel}</span>
                      {it.geannuleerd ? <span className="block text-xs">gaat niet door</span> : null}
                      {it.plaats ? <span className="block text-xs text-ink-soft">{it.plaats}</span> : null}
                      {!afdeling && it.department_id ? (
                        <span className="block text-xs text-ink-soft">afdeling {namen[it.department_id] ?? ''}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      ) : null}
      <p className="text-sm text-ink-faint">
        <span className="mr-3 inline-block h-3 w-3 rounded bg-surface-soft align-middle ring-1 ring-line" /> vaste dag
        <span className="ml-4 mr-3 inline-block h-3 w-3 rounded bg-accent-soft align-middle" /> activiteit
      </p>
    </div>
  )
}
