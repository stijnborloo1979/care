import { Link, useParams } from 'react-router-dom'
import Avatar from '../../components/Avatar'
import { hhmm } from '../../lib/time'
import { useHousehold } from '../household/useHousehold'
import { useAgenda } from '../today/useAgenda'
import { usePeople } from './usePeople'

export default function WhoIsWho() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { data: people, isLoading } = usePeople(hh)
  const { data: events } = useAgenda(hh, tz)

  const familie = (people ?? []).filter((p) => p.kind === 'family')
  const rest = (people ?? []).filter((p) => p.kind === 'contact' || p.kind === 'care')
  const bezoek = (events ?? []).filter((e) => e.person_id)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">Wie is wie?</h1>
      <p className="mt-1 text-lg text-ink-soft">Tik op iemand om meer te zien.</p>

      {bezoek.length > 0 ? (
        <section className="mt-6 rounded-card border border-line bg-surface-soft p-4">
          <h2 className="text-base font-bold text-ink-faint">Vandaag</h2>
          <ul className="mt-2 space-y-1">
            {bezoek.map((e) => {
              const p = (people ?? []).find((x) => x.id === e.person_id)
              return (
                <li key={e.id} className="text-lg">
                  <strong>{p?.name ?? e.title}</strong> — {e.title.toLowerCase()} om{' '}
                  {hhmm(new Date(e.starts_at), tz)}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {isLoading ? <p className="mt-6 text-ink-soft">Bezig met laden…</p> : null}

      <Groep titel="Familie" mensen={familie} />
      <Groep titel="Zorg en buren" mensen={rest} />
    </main>
  )
}

function Groep({
  titel,
  mensen,
}: {
  titel: string
  mensen: { id: string; name: string; relation: string; photo_path: string | null; color: string | null }[]
}) {
  if (mensen.length === 0) return null
  return (
    <section className="mt-7">
      <h2 className="text-lg font-bold">{titel}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mensen.map((p) => (
          <Link
            key={p.id}
            to={`/wie/${p.id}`}
            className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-4 text-center shadow-card"
          >
            <Avatar name={p.name} photoPath={p.photo_path} color={p.color} size="l" />
            <span>
              <span className="block text-lg font-bold">{p.name}</span>
              <span className="text-ink-soft">{p.relation}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

/** Eén persoon, groot. De vraag is "wie is dit", niet "welke gegevens hebben we". */
export function PersonDetail() {
  const { personId = '' } = useParams()
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { data: people, isLoading } = usePeople(hh)
  const { data: events } = useAgenda(hh, tz)

  const p = (people ?? []).find((x) => x.id === personId)
  const vandaag = (events ?? []).find((e) => e.person_id === personId)

  if (isLoading) return <p className="p-6 text-ink-soft">Bezig met laden…</p>
  if (!p) return <p className="p-6 text-ink-soft">Deze persoon staat er niet meer bij.</p>

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/wie" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Terug
      </Link>

      <div className="mt-6 text-center">
        <div className="flex justify-center">
          <Avatar name={p.name} photoPath={p.photo_path} color={p.color} size="l" />
        </div>
        <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{p.name}</h1>
        <p className="text-lg text-ink-soft">{p.relation}</p>
      </div>

      <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card">
        {p.description ? <p className="text-xl leading-snug">{p.description}</p> : null}
        {p.detail ? <p className="mt-3 text-lg text-ink-soft">{p.detail}</p> : null}
        {vandaag ? (
          <p className="mt-4 inline-block rounded-pill border border-accent bg-accent-soft px-4 py-1 font-semibold text-accent-ink">
            Vandaag om {hhmm(new Date(vandaag.starts_at), tz)}
          </p>
        ) : null}
      </div>

      {p.phone ? (
        <a
          href={`tel:${p.phone.replace(/\s/g, '')}`}
          className="mt-5 flex min-h-[4rem] w-full items-center justify-center gap-3 rounded-card bg-accent-ink px-5 text-xl font-bold text-white"
        >
          📞 Bel {p.name}
        </a>
      ) : null}
    </main>
  )
}
