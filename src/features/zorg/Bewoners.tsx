import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useOngezien } from './OpenVragen'
import { ChevronRight, Search, TriangleAlert } from 'lucide-react'
import { alleBewoners, mijnBewoners, type Bewoner } from './zorgApi'
import { useOrganisatie } from './useOrganisatie'
import { Fout, Kaart, Kop, Laden, Leeg } from './ui'
import AfdelingNu from './AfdelingNu'

function plaats(b: Pick<Bewoner, 'afdeling' | 'kamer'>) {
  return [b.afdeling, b.kamer ? `kamer ${b.kamer}` : null].filter(Boolean).join(' · ') || 'Nog geen afdeling'
}

/**
 * De eerste vraag van een medewerker: voor wie zorg ik vandaag? Daarna,
 * kleiner: wie woont hier nog. Van die bewoners zie je alleen naam en
 * kamer; meer niet, tenzij je toegewezen bent of noodtoegang neemt.
 */
export default function Bewoners() {
  const { org } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const [zoek, setZoek] = useState('')

  const mijn = useQuery({ queryKey: ['zorg', 'mijn-bewoners', orgId], enabled: !!orgId, queryFn: () => mijnBewoners(orgId) })
  const alle = useQuery({ queryKey: ['zorg', 'alle-bewoners', orgId], enabled: !!orgId, queryFn: () => alleBewoners(orgId) })
  // Nieuwe vragen van bewoners (68): de database toont alleen die van mijn bewoners.
  const nieuw = useOngezien(orgId)

  const mijnIds = new Set((mijn.data ?? []).map((b) => b.household_id))
  const past = (b: Bewoner) =>
    !zoek || `${b.naam} ${b.afdeling ?? ''} ${b.kamer ?? ''}`.toLowerCase().includes(zoek.toLowerCase())
  const anderen = (alle.data ?? []).filter((b) => !mijnIds.has(b.household_id)).filter(past)

  return (
    <div className="space-y-6">
      <Kop
        titel="Bewoners"
        uitleg={org?.team_lead ? 'Jouw bewoners en die van je afdeling.' : 'De bewoners die jou zijn toegewezen.'}
      />

      <AfdelingNu orgId={orgId} mijn={mijn.data ?? []} />

      <Kaart titel="Mijn bewoners">
        {mijn.isLoading ? <Laden /> : null}
        <Fout fout={mijn.error} />
        {mijn.data && mijn.data.length === 0 ? (
          <Leeg>
            Je bent nog aan niemand toegewezen. Vraag het aan je coördinator of de beheerder van{' '}
            {org?.naam ?? 'je organisatie'}.
          </Leeg>
        ) : null}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(mijn.data ?? []).filter(past).map((b) => (
            <li key={b.household_id} className="min-w-0">
              <Link
                to={`/zorg/bewoner/${b.household_id}`}
                className="flex min-h-touch items-center gap-3 rounded-2xl bg-surface-soft px-4 py-3 hover:bg-surface-deep"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-bold text-accent-ink">
                  {b.naam.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{b.naam}</span>
                  <span className="block truncate text-sm text-ink-soft">
                    {plaats(b)}
                    {b.via === 'afdeling' ? ' · via je afdeling' : ''}
                  </span>
                </span>
                {nieuw.data?.[b.household_id] ? (
                  <span className="shrink-0 rounded-pill bg-alert px-2.5 py-1 text-xs font-bold text-white">
                    {nieuw.data[b.household_id]} {nieuw.data[b.household_id] === 1 ? 'vraag' : 'vragen'}
                  </span>
                ) : null}
                <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Kaart>

      {(alle.data ?? []).length > 0 ? (
        <Kaart titel="Andere bewoners">
          <p className="text-sm text-ink-soft">
            Je ziet hier alleen naam en kamer.
            {org?.team_lead ? ' In een noodgeval kan je als team lead 4 uur meekijken; de familie krijgt daar meteen bericht van.' : ''}
          </p>
          <label className="relative mt-3 block max-w-md">
            <span className="sr-only">Zoek een bewoner</span>
            <Search size={18} strokeWidth={1.75} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Naam, afdeling of kamer"
              className="min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface pl-11 pr-4"
            />
          </label>
          <ul className="mt-3 divide-y divide-line">
            {anderen.map((b) => (
              <li key={b.household_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{b.naam}</span>
                  <span className="block text-sm text-ink-soft">{plaats(b)}</span>
                </span>
                {org?.team_lead ? (
                  <Link
                    to={`/zorg/bewoner/${b.household_id}?nood=1`}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-surface-soft"
                  >
                    <TriangleAlert size={15} strokeWidth={1.75} aria-hidden="true" />
                    Noodtoegang
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {anderen.length === 0 ? <Leeg>Geen andere bewoners gevonden.</Leeg> : null}
        </Kaart>
      ) : null}
    </div>
  )
}
