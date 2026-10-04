import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Megaphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOrganisatie } from './useOrganisatie'
import {
  activiteiten,
  afdelingen as haalAfdelingen,
  alleBewoners,
  annuleerActiviteit,
  deelnames,
  mijnBewoners,
  nieuweActiviteit,
  schrijfIn,
  zetAanwezigheid,
  type Activiteit,
  type Deelname,
} from './zorgApi'
import { Fout, Kaart, Kop, Laden, Leeg, dagEnUur, knop, knopKlein, label, veld } from './ui'
import VasteDag from './VasteDag'
import { tt } from '../../lib/uiTaal'

/** Zingen, wandelen, de kapper: wat er te doen is, en wie meedoet. */
export default function Activiteiten() {
  const { org, beheert } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const magPlannen = beheert || !!org?.team_lead
  const lijst = useQuery({ queryKey: ['zorg', 'activiteiten', orgId], enabled: !!orgId, queryFn: () => activiteiten(orgId) })
  const [open, setOpen] = useState<string | null>(null)

  if (!org) return null
  return (
    <div className="space-y-6">
      <Kop
        titel={tt('Activiteiten')}
        uitleg={tt('Wat er gepland is in het woonzorgcentrum. Het staat vanzelf op de tablets van de bewoners.')}
        rechts={
          magPlannen ? (
            <Link to="/zorg/nieuws" className={`${knopKlein} inline-flex items-center gap-2`}>
              <Megaphone size={16} strokeWidth={1.75} aria-hidden="true" /> {tt('Nieuws voor de families')}
            </Link>
          ) : null
        }
      />
      <VasteDag orgId={orgId} magPlannen={magPlannen} beheert={beheert} />
      {magPlannen ? <NieuweActiviteit orgId={orgId} /> : null}
      <Kaart titel={tt('Gepland')}>
        {lijst.isLoading ? <Laden /> : null}
        <Fout fout={lijst.error} />
        {lijst.data && lijst.data.length === 0 ? <Leeg>{tt('Er is nog niets gepland.')}</Leeg> : null}
        <ul className="space-y-2">
          {(lijst.data ?? []).map((a) => (
            <li key={a.id} className="rounded-2xl border border-line">
              <button
                onClick={() => setOpen(open === a.id ? null : a.id)}
                aria-expanded={open === a.id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-lg font-semibold ${a.status === 'geannuleerd' ? 'line-through' : ''}`}>
                    {a.titel}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {dagEnUur(a.starts_at)}
                    {a.plaats ? ` · ${a.plaats}` : ''}
                    {a.status === 'geannuleerd' ? ` · ${tt('geannuleerd')}` : ''}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={`shrink-0 text-ink-faint transition-transform ${open === a.id ? 'rotate-180' : ''}`}
                />
              </button>
              {open === a.id ? <Deelnemers activiteit={a} magBeheren={beheert} /> : null}
            </li>
          ))}
        </ul>
      </Kaart>
    </div>
  )
}

function NieuweActiviteit({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId) })
  const [titel, setTitel] = useState('')
  const [wanneer, setWanneer] = useState('')
  const [plaats, setPlaats] = useState('')
  const [afdeling, setAfdeling] = useState('')

  const bewaar = useMutation({
    mutationFn: () =>
      nieuweActiviteit({
        org_id: orgId,
        department_id: afdeling || null,
        titel,
        starts_at: new Date(wanneer).toISOString(),
        plaats: plaats.trim() || null,
      }),
    onSuccess: () => {
      setTitel('')
      setWanneer('')
      setPlaats('')
      queryClient.invalidateQueries({ queryKey: ['zorg', 'activiteiten', orgId] })
    },
  })

  return (
    <Kaart titel={tt('Nieuwe activiteit')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          bewaar.mutate()
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="sm:col-span-2">
          <span className={label}>{tt('Wat')}</span>
          <input required maxLength={120} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder={tt('Samen zingen')} className={veld} />
        </label>
        <label>
          <span className={label}>{tt('Wanneer')}</span>
          <input required type="datetime-local" value={wanneer} onChange={(e) => setWanneer(e.target.value)} className={veld} />
        </label>
        <label>
          <span className={label}>{tt('Waar')}</span>
          <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder={tt('Cafetaria')} className={veld} />
        </label>
        <label className="sm:col-span-2">
          <span className={label}>{tt('Voor')}</span>
          <select value={afdeling} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
            <option value="">{tt('Het hele woonzorgcentrum')}</option>
            {(afd.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {tt('Afdeling {naam}', { naam: a.name })}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={bewaar.isPending} className={`${knop} w-full sm:w-auto`}>
            {bewaar.isPending ? tt('Bezig…') : tt('Activiteit plannen')}
          </button>
          <Fout fout={bewaar.error} />
        </div>
      </form>
    </Kaart>
  )
}

const STATUS: Record<Deelname['status'], string> = {
  ingeschreven: tt('ingeschreven'),
  aanwezig: tt('aanwezig'),
  afwezig: tt('afwezig'),
}

function Deelnemers({ activiteit, magBeheren }: { activiteit: Activiteit; magBeheren: boolean }) {
  const queryClient = useQueryClient()
  const sleutel = ['zorg', 'deelnames', activiteit.id]
  const lijst = useQuery({ queryKey: sleutel, queryFn: () => deelnames(activiteit.id) })
  const alle = useQuery({ queryKey: ['zorg', 'alle-bewoners', activiteit.org_id], queryFn: () => alleBewoners(activiteit.org_id) })
  const mijn = useQuery({ queryKey: ['zorg', 'mijn-bewoners', activiteit.org_id], queryFn: () => mijnBewoners(activiteit.org_id) })
  const namen = Object.fromEntries((alle.data ?? []).map((b) => [b.household_id, b.naam]))
  const mijnIds = new Set((mijn.data ?? []).map((b) => b.household_id))
  const ingeschreven = new Set((lijst.data ?? []).map((d) => d.household_id))
  const [nieuw, setNieuw] = useState('')

  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: sleutel })
    queryClient.invalidateQueries({ queryKey: ['dag-van-huis'] })
  }
  const inschrijven = useMutation({ mutationFn: (hh: string) => schrijfIn(activiteit.id, hh), onSuccess: () => { setNieuw(''); ververs() } })
  // Wie er gewoon bij was, zonder eerst in te schrijven.
  const wasErbij = useMutation({ mutationFn: (hh: string) => schrijfIn(activiteit.id, hh, 'aanwezig'), onSuccess: () => { setNieuw(''); ververs() } })
  const aanwezig = useMutation({
    mutationFn: (p: { hh: string; status: Deelname['status'] }) => zetAanwezigheid(activiteit.id, p.hh, p.status),
    onSuccess: ververs,
  })
  const annuleer = useMutation({
    mutationFn: () => annuleerActiviteit(activiteit.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zorg', 'activiteiten', activiteit.org_id] }),
  })

  const teKiezen = (mijn.data ?? []).filter((b) => !ingeschreven.has(b.household_id))

  return (
    <div className="border-t border-line px-4 py-3">
      {lijst.data && lijst.data.length === 0 ? <Leeg>{tt('Nog niemand ingeschreven.')}</Leeg> : null}
      <ul className="space-y-1.5">
        {(lijst.data ?? []).map((d) => (
          <li key={d.household_id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
            <span className="min-w-0 flex-1 font-semibold">{namen[d.household_id] ?? tt('Bewoner')}</span>
            <span className="text-sm text-ink-soft">{STATUS[d.status]}</span>
            {mijnIds.has(d.household_id) && activiteit.status !== 'geannuleerd' ? (
              <span className="flex gap-1">
                <button
                  onClick={() => aanwezig.mutate({ hh: d.household_id, status: 'aanwezig' })}
                  aria-pressed={d.status === 'aanwezig'}
                  className={knopKlein}
                >
                  {tt('Aanwezig')}
                </button>
                <button
                  onClick={() => aanwezig.mutate({ hh: d.household_id, status: 'afwezig' })}
                  aria-pressed={d.status === 'afwezig'}
                  className={knopKlein}
                >
                  {tt('Afwezig')}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {activiteit.status === 'gepland' && teKiezen.length > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (nieuw) inschrijven.mutate(nieuw)
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="min-w-[12rem] flex-1">
            <span className={label}>{tt('Iemand inschrijven')}</span>
            <select value={nieuw} onChange={(e) => setNieuw(e.target.value)} className={veld}>
              <option value="">{tt('Kies een bewoner')}</option>
              {teKiezen.map((b) => (
                <option key={b.household_id} value={b.household_id}>
                  {b.naam}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!nieuw || inschrijven.isPending} className={knop}>
            {tt('Inschrijven')}
          </button>
          <button
            type="button"
            onClick={() => nieuw && wasErbij.mutate(nieuw)}
            disabled={!nieuw || wasErbij.isPending}
            className={knopKlein}
          >
            {tt('Was erbij')}
          </button>
        </form>
      ) : null}
      <Fout fout={inschrijven.error ?? wasErbij.error ?? aanwezig.error ?? annuleer.error} />

      {magBeheren && activiteit.status === 'gepland' ? (
        <button
          onClick={() => {
            if (confirm(tt('"{titel}" annuleren?', { titel: activiteit.titel }))) annuleer.mutate()
          }}
          className="mt-3 text-sm font-semibold text-ink-soft underline underline-offset-4"
        >
          {tt('Activiteit annuleren')}
        </button>
      ) : null}
    </div>
  )
}
