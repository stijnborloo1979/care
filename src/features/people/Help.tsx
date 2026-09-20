import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from './usePeople'

/**
 * Eén scherm, grote knoppen, geen keuzes die uitleg nodig hebben.
 * Wie hier terechtkomt, is in de war of ongerust.
 */
export default function Help() {
  const { household } = useHousehold()
  const { data: people } = usePeople(household?.household_id ?? '')

  const bellen = (people ?? []).filter((p) => p.phone && p.kind !== 'self').slice(0, 3)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Vandaag
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">Hulp</h1>
      <p className="mt-1 text-lg text-ink-soft">Kies wat je nodig hebt.</p>

      <div className="mt-6 space-y-3">
        {bellen.map((p) => (
          <a
            key={p.id}
            href={`tel:${(p.phone ?? '').replace(/\s/g, '')}`}
            className="flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface px-5 text-xl font-bold shadow-card"
          >
            <span className="text-3xl" aria-hidden="true">
              📞
            </span>
            Bel {p.name}
          </a>
        ))}

        <div className="rounded-card border-[1.5px] border-line-strong bg-surface p-5">
          <p className="text-xl font-bold">Waar ben ik?</p>
          <p className="mt-1 text-lg text-ink-soft">
            Je bent thuis{household?.person_name ? '' : ''}. Blijf rustig zitten en bel iemand
            hierboven.
          </p>
        </div>

        <a
          href="tel:112"
          className="flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-alert bg-surface px-5 text-xl font-bold text-alert shadow-card"
        >
          <span className="text-3xl" aria-hidden="true">
            🚑
          </span>
          Noodnummer 112
        </a>
      </div>

      <p className="mt-5 text-center text-sm text-ink-faint">
        Bel 112 alleen bij dringende medische hulp, brand of gevaar.
      </p>
    </main>
  )
}
