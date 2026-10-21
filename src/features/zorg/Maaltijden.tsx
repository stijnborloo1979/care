import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganisatie } from './useOrganisatie'
import { afdelingen as haalAfdelingen, mijnBewoners } from './zorgApi'
import { registratieVoor, maaltijdZet, maaltijdAnalyse } from './maaltijdApi'
import { vasteDag } from '../../services/afdelingsdag'
import { uitstappen as uitstapLijst, uitstapVervaltMaaltijd, uitLokaleTijd } from '../../services/uitstap'
import { maaltijdMomenten, nietGeregistreerd, opvallend, procent, STATUSSEN, totaal, type MaaltijdStatus } from '../../services/maaltijdPuur'
import { localDateKey } from '../../lib/time'
import { Fout, Kaart, Laden, Leeg, knopKlein } from './ui'

/** Een keuzeknop; aangeklikt is hij gevuld. */
const chip = (aan: boolean) => `${knopKlein} ${aan ? 'border-accent-ink bg-accent-ink text-white hover:bg-accent-ink' : ''}`
import { tt } from '../../lib/uiTaal'

const TZ = 'Europe/Brussels'

/**
 * Maaltijden (107): per bewoner noteren wat er gegeten is, en het WZC zien
 * welke maaltijden blijven staan. Vandaag is het werkscherm van de ploeg;
 * Analyse is voor de leiding (alleen aantallen, geen namen).
 */
export default function Maaltijden() {
  const { org } = useOrganisatie()
  const [deel, setDeel] = useState<'vandaag' | 'analyse'>('vandaag')
  if (!org) return null
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex gap-2 rounded-pill bg-surface-soft p-1">
        {(['vandaag', 'analyse'] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={deel === d}
            onClick={() => setDeel(d)}
            className={`min-h-touch rounded-pill px-5 font-semibold ${deel === d ? 'bg-surface shadow-card' : 'text-ink-soft'}`}
          >
            {d === 'vandaag' ? tt('Vandaag') : tt('Analyse')}
          </button>
        ))}
      </div>
      {deel === 'vandaag' ? <Vandaag orgId={org.org_id} /> : <Analyse orgId={org.org_id} />}
    </div>
  )
}

function Vandaag({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const nu = new Date()
  const dag = localDateKey(nu, TZ)
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const bewoners = useQuery({ queryKey: ['zorg', 'mijn-bewoners', orgId], queryFn: () => mijnBewoners(orgId), enabled: !!orgId })
  const vast = useQuery({ queryKey: ['zorg', 'vaste-dag', orgId], queryFn: () => vasteDag(orgId), enabled: !!orgId })
  const [afdeling, setAfdeling] = useState<string | null>(null)
  const gekozen = afdeling ?? afd.data?.[0]?.id ?? null
  const naam = afd.data?.find((a) => a.id === gekozen)?.name ?? null
  const mijn = (bewoners.data ?? []).filter((b) => b.afdeling === naam)
  const hhs = mijn.map((b) => b.household_id)

  const momenten = maaltijdMomenten(vast.data ?? [], gekozen, nu)
  const [moment, setMoment] = useState<string | null>(null)
  const gekozenMoment = momenten.find((m) => m.id === moment) ?? momenten[0] ?? null

  const reg = useQuery({ queryKey: ['zorg', 'maaltijd', orgId, dag, hhs.join(',')], queryFn: () => registratieVoor(hhs, dag), enabled: hhs.length > 0 })
  const uit = useQuery({ queryKey: ['zorg', 'maaltijd-uitstap', orgId, hhs.join(',')], queryFn: () => uitstapLijst(hhs), enabled: hhs.length > 0, refetchInterval: 5 * 60_000 })

  const zet = useMutation({
    mutationFn: (p: { hh: string; status: MaaltijdStatus }) => maaltijdZet({ hh: p.hh, moment: gekozenMoment!.id, dag, status: p.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zorg', 'maaltijd', orgId] }),
  })

  if (afd.isLoading || bewoners.isLoading) return <Laden />
  if ((afd.data ?? []).length === 0) return <Leeg>{tt('Nog geen afdelingen.')}</Leeg>

  const momentTijd = gekozenMoment ? uitLokaleTijd(`${dag}T${gekozenMoment.begint.slice(0, 5)}`, TZ) : null
  const status = (hh: string) => reg.data?.find((r) => r.household_id === hh && r.afdeling_dag_id === gekozenMoment?.id)?.status

  return (
    <div className="space-y-4">
      <Kaart titel={tt('Wie heeft er gegeten?')}>
        <div className="flex flex-wrap gap-2">
          {(afd.data ?? []).map((a) => (
            <button key={a.id} onClick={() => setAfdeling(a.id)} className={chip(a.id === gekozen)}>
              {a.name}
            </button>
          ))}
        </div>
        {momenten.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {momenten.map((m) => (
              <button key={m.id} onClick={() => setMoment(m.id)} className={chip(m.id === gekozenMoment?.id)}>
                {m.titel} · {m.begint.slice(0, 5)}
              </button>
            ))}
          </div>
        ) : (
          <Leeg>{tt('Geen maaltijd op deze afdeling vandaag.')}</Leeg>
        )}
        <Fout fout={reg.error ?? zet.error ?? uit.error} />
      </Kaart>

      {gekozenMoment && mijn.length === 0 ? <Leeg>{tt('Geen bewoners op deze afdeling.')}</Leeg> : null}

      {gekozenMoment && mijn.length > 0 ? (
        <ul className="space-y-2">
          {mijn.map((b) => {
            const huidige = status(b.household_id)
            const opUitstap = !!momentTijd && (uit.data ?? []).some((u) => u.household_id === b.household_id && uitstapVervaltMaaltijd(u, momentTijd))
            return (
              <li key={b.household_id} className="rounded-card bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold">{b.naam}</p>
                  {opUitstap && !huidige ? (
                    <span className="rounded-pill bg-surface-soft px-3 py-1 text-sm font-semibold text-ink-soft">{tt('Op uitstap, geen maaltijd')}</span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {STATUSSEN.map((s) => (
                    <button
                      key={s.waarde}
                      disabled={zet.isPending}
                      aria-pressed={huidige === s.waarde}
                      onClick={() => zet.mutate({ hh: b.household_id, status: s.waarde })}
                      className={`min-h-touch rounded-2xl px-2 font-semibold ${huidige === s.waarde ? 'bg-accent-ink text-white' : 'border-[1.5px] border-line-strong'}`}
                    >
                      {tt(s.woord)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-soft">{huidige ? tt('Geregistreerd: {status}', { status: tt(STATUSSEN.find((s) => s.waarde === huidige)!.woord) }) : tt('Nog niet geregistreerd')}</p>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function Analyse({ orgId }: { orgId: string }) {
  const [dagen, setDagen] = useState(7)
  const tot = localDateKey(new Date(), TZ)
  const van = localDateKey(new Date(Date.now() - (dagen - 1) * 86_400_000), TZ)
  const data = useQuery({ queryKey: ['zorg', 'maaltijd-analyse', orgId, van, tot], queryFn: () => maaltijdAnalyse(orgId, van, tot), enabled: !!orgId })
  const rijen = data.data ?? []
  const t = totaal(rijen)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30].map((n) => (
          <button key={n} onClick={() => setDagen(n)} className={chip(dagen === n)}>
            {n === 7 ? tt('Afgelopen week') : tt('Afgelopen maand')}
          </button>
        ))}
      </div>
      <Fout fout={data.error} />
      {data.isLoading ? <Laden /> : null}
      {!data.isLoading && rijen.length === 0 ? <Leeg>{tt('Nog geen maaltijden geregistreerd in deze periode.')}</Leeg> : null}

      {rijen.length > 0 ? (
        <Kaart titel={tt('Het hele woonzorgcentrum')}>
          <p className="text-ink-soft">
            {tt('Gegeten {g}%, half {h}%, niet {n}%.', { g: t.gegeten, h: t.half, n: t.niet })}
          </p>
          {t.nietGeregistreerd > 0 ? (
            <p className="mt-1 text-sm text-ink-faint">{tt('{n} maaltijden zijn nog niet geregistreerd.', { n: t.nietGeregistreerd })}</p>
          ) : null}
        </Kaart>
      ) : null}

      <ul className="space-y-2">
        {rijen.map((r) => (
          <li key={`${r.afdeling_naam}-${r.moment_titel}`} className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">
                {r.moment_titel} <span className="font-normal text-ink-soft">· {r.afdeling_naam}</span>
              </p>
              {opvallend(r) ? (
                <span className="rounded-pill bg-alert-soft px-3 py-1 text-sm font-semibold text-alert">{tt('Vaak niet gegeten')}</span>
              ) : null}
            </div>
            <div className="mt-2 flex h-3 overflow-hidden rounded-pill bg-surface-soft" role="img" aria-label={tt('Gegeten {g}%, half {h}%, niet {n}%.', { g: procent(r.aantal_gegeten, r.aantal_verwacht), h: procent(r.aantal_half, r.aantal_verwacht), n: procent(r.aantal_niet, r.aantal_verwacht) })}>
              <span style={{ width: `${procent(r.aantal_gegeten, r.aantal_verwacht)}%` }} className="bg-accent-ink" />
              <span style={{ width: `${procent(r.aantal_half, r.aantal_verwacht)}%` }} className="bg-accent-soft" />
              <span style={{ width: `${procent(r.aantal_niet, r.aantal_verwacht)}%` }} className="bg-alert" />
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {tt('Gegeten {g}%, half {h}%, niet {n}%.', { g: procent(r.aantal_gegeten, r.aantal_verwacht), h: procent(r.aantal_half, r.aantal_verwacht), n: procent(r.aantal_niet, r.aantal_verwacht) })}
              {nietGeregistreerd(r) > 0 ? ` · ${tt('{n} niet geregistreerd', { n: nietGeregistreerd(r) })}` : ''}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-faint">{tt('Alleen aantallen. Geen namen, geen notities.')}</p>
    </div>
  )
}
