import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Car, Search } from 'lucide-react'
import { actueel, toestand, uitstapStap, uitstappen, vanTot } from '../../services/uitstap'
import { localDateKey } from '../../lib/time'
import { emojiVan, kwijtOpAfdeling, markeerGevonden, sindsTekst } from '../../services/spullen'
import type { Bewoner } from './zorgApi'
import { Fout, Kaart, knopKlein } from './ui'

const TZ = 'Europe/Brussels'

/**
 * Bovenaan de bewonerslijst: wie er op uitstap is (80) en wat er kwijt is
 * op de afdeling (81). Leeg? Dan staat hier niets.
 */
export default function AfdelingNu({ orgId, mijn }: { orgId: string; mijn: Bewoner[] }) {
  const queryClient = useQueryClient()
  const ids = mijn.map((b) => b.household_id)
  const namen = Object.fromEntries(mijn.map((b) => [b.household_id, b.naam]))
  const uit = useQuery({
    queryKey: ['uitstappen-team', orgId, ids.join(',')],
    queryFn: () => uitstappen(ids),
    enabled: ids.length > 0,
    refetchInterval: 5 * 60_000,
    retry: false,
  })
  const kwijt = useQuery({
    queryKey: ['kwijt-op-afdeling', orgId],
    queryFn: () => kwijtOpAfdeling(orgId),
    enabled: !!orgId,
    refetchInterval: 5 * 60_000,
    retry: false,
  })
  const stap = useMutation({
    mutationFn: (p: { id: string; stap: 'weg' | 'terug' }) => uitstapStap(p.id, p.stap),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uitstappen-team'] })
      queryClient.invalidateQueries({ queryKey: ['uitstappen'] })
    },
  })
  const gevonden = useMutation({
    mutationFn: markeerGevonden,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kwijt-op-afdeling'] })
      queryClient.invalidateQueries({ queryKey: ['spullen'] })
    },
  })

  const nu = new Date()
  const vandaag = (uit.data ?? [])
    .filter((u) => actueel(u, nu, TZ))
    .filter((u) => u.status === 'weg' || localDateKey(new Date(u.vertrek), TZ) === localDateKey(nu, TZ))
  const lijstKwijt = kwijt.data ?? []
  if (vandaag.length === 0 && lijstKwijt.length === 0) return null

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {vandaag.length > 0 ? (
        <Kaart titel={<><Car size={20} strokeWidth={1.75} aria-hidden="true" /> Uitstap vandaag</>}>
          <ul className="space-y-2">
            {vandaag.map((u) => {
              const tst = toestand(u, nu)
              return (
                <li key={u.id} className={`flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 ${tst === 'te-laat' ? 'bg-alert-soft ring-1 ring-alert' : 'bg-surface-soft'}`}>
                  <span className="min-w-0 flex-1">
                    <Link to={`/zorg/bewoner/${u.household_id}`} className="font-semibold underline-offset-4 hover:underline">
                      {namen[u.household_id] ?? 'Bewoner'}
                    </Link>{' '}
                    met {u.met_wie}
                    <span className={`block text-sm ${tst === 'te-laat' ? 'font-semibold text-alert' : 'text-ink-soft'}`}>
                      {vanTot(u, TZ, nu)} · {tst === 'te-laat' ? 'nog niet terug' : tst === 'weg' ? 'vertrokken' : 'gepland'}
                    </span>
                  </span>
                  {u.status === 'gepland' ? (
                    <button disabled={stap.isPending} onClick={() => stap.mutate({ id: u.id, stap: 'weg' })} className={knopKlein}>
                      Vertrokken
                    </button>
                  ) : null}
                  {u.status === 'weg' ? (
                    <button disabled={stap.isPending} onClick={() => stap.mutate({ id: u.id, stap: 'terug' })} className={knopKlein}>
                      Is terug
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <Fout fout={stap.error} />
        </Kaart>
      ) : null}

      {lijstKwijt.length > 0 ? (
        <Kaart titel={<><Search size={20} strokeWidth={1.75} aria-hidden="true" /> Kwijt op de afdeling</>}>
          <ul className="space-y-2">
            {lijstKwijt.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
                <span className="text-2xl" aria-hidden="true">{emojiVan(k.soort)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{k.naam}</span> van {k.bewoner}
                  {k.kamer ? ` (kamer ${k.kamer})` : ''}
                  <span className="block text-sm text-ink-soft">
                    {[k.kenmerk, k.waar ? `hoort: ${k.waar}` : null, sindsTekst(k.kwijt_sinds, nu)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button disabled={gevonden.isPending} onClick={() => gevonden.mutate(k.id)} className={knopKlein}>
                  Gevonden
                </button>
              </li>
            ))}
          </ul>
          <Fout fout={gevonden.error} />
        </Kaart>
      ) : null}
    </div>
  )
}
