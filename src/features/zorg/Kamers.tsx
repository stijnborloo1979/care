import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, DoorOpen, Trash2 } from 'lucide-react'
import { useOrganisatie } from './useOrganisatie'
import { afdelingen as haalAfdelingen, zetVerblijf } from './zorgApi'
import {
  bezetting,
  bezettingPerAfdeling,
  kamerReeks,
  kamers as haalKamers,
  nieuweKamers,
  totalen,
  wijzigKamer,
  wisKamer,
  type AfdelingStand,
  type Bezetting,
  type KamerStand,
} from '../../services/kamers'
import { Fout, Kaart, Kop, Laden, Leeg, knop, knopKlein, label, veld } from './ui'

/**
 * Kamers en bezetting (82): welke kamers er zijn, wie waar woont en wat
 * vrij is. Een bewoner krijgt een kamer met het bestaande zet_verblijf.
 */
export default function Kamers() {
  const { org, beheert } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const queryClient = useQueryClient()
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const km = useQuery({ queryKey: ['zorg', 'kamers', orgId], queryFn: () => haalKamers(orgId), enabled: !!orgId })
  const bz = useQuery({ queryKey: ['zorg', 'bezetting', orgId], queryFn: () => bezetting(orgId), enabled: !!orgId })
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ['zorg', 'kamers', orgId] })
    queryClient.invalidateQueries({ queryKey: ['zorg', 'bezetting', orgId] })
    queryClient.invalidateQueries({ queryKey: ['zorg', 'alle-bewoners', orgId] })
    queryClient.invalidateQueries({ queryKey: ['zorg', 'mijn-bewoners', orgId] })
  }
  if (!org) return null

  const standen = bezettingPerAfdeling(afd.data ?? [], km.data ?? [], bz.data ?? [])
  const t = totalen(standen)
  const zonderKamer = standen.reduce((n, a) => n + a.zonderKamer.length, 0)
  const tegels: [string, number | null][] = [
    ['Bewoners', t.bewoners],
    ['Bedden', t.bedden],
    ['Vrije bedden', t.vrij],
    ['Zonder kamer', zonderKamer],
  ]

  return (
    <div className="space-y-6">
      <Kop titel="Kamers en bezetting" uitleg="Wie waar woont en wat er vrij is, per afdeling." />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tegels.map(([naam, n]) => (
          <div key={naam} className="min-w-0 rounded-card bg-surface p-4 shadow-card">
            <dt className="truncate text-sm text-ink-soft">{naam}</dt>
            <dd className="text-3xl font-bold tabular-nums">{n ?? '–'}</dd>
          </div>
        ))}
      </dl>

      {afd.isLoading || km.isLoading || bz.isLoading ? <Laden /> : null}
      <Fout fout={afd.error ?? km.error ?? bz.error} />
      {(km.data ?? []).length === 0 && !km.isLoading ? (
        <Leeg>
          Er zijn nog geen kamers ingevoerd.{' '}
          {beheert ? 'Voeg ze hieronder toe, bijvoorbeeld "101-120" in één keer.' : 'Vraag het aan de beheerder of een coördinator.'}
        </Leeg>
      ) : null}

      {standen.map((a) => (
        <AfdelingKaart key={a.id ?? 'zonder'} stand={a} magBeheren={beheert} onKlaar={ververs} />
      ))}

      {beheert && (afd.data ?? []).length > 0 ? <KamersToevoegen orgId={orgId} afdelingen={afd.data ?? []} onKlaar={ververs} /> : null}
      {beheert && (afd.data ?? []).length === 0 && !afd.isLoading ? (
        <Leeg>
          Maak eerst afdelingen aan bij <Link to="/zorg/beheer" className="font-semibold underline">Beheer</Link>.
        </Leeg>
      ) : null}
    </div>
  )
}

function AfdelingKaart({ stand, magBeheren, onKlaar }: { stand: AfdelingStand; magBeheren: boolean; onKlaar: () => void }) {
  const vrij = stand.kamers.reduce((n, k) => n + k.vrij, 0)
  return (
    <Kaart
      titel={
        <span className="flex w-full flex-wrap items-baseline justify-between gap-2">
          <span>{stand.id ? `Afdeling ${stand.naam}` : stand.naam}</span>
          <span className="text-sm font-normal text-ink-soft">
            {stand.bezet} {stand.bezet === 1 ? 'bewoner' : 'bewoners'}
            {stand.bedden > 0 ? ` · ${vrij} vrij van ${stand.bedden}` : ''}
          </span>
        </span>
      }
    >
      {stand.kamers.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {stand.kamers.map((k) => (
            <KamerTegel key={k.kamer.id} stand={k} afdeling={stand} magBeheren={magBeheren} onKlaar={onKlaar} />
          ))}
        </ul>
      ) : stand.id ? (
        <p className="text-sm text-ink-soft">Nog geen kamers op deze afdeling.</p>
      ) : null}

      {stand.zonderKamer.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Nog zonder kamer</h3>
          <ul className="mt-2 space-y-1.5">
            {stand.zonderKamer.map((b) => (
              <ZonderKamer key={b.household_id} b={b} afdeling={stand} magBeheren={magBeheren} onKlaar={onKlaar} />
            ))}
          </ul>
        </div>
      ) : null}
    </Kaart>
  )
}

function KamerTegel({ stand, afdeling, magBeheren, onKlaar }: { stand: KamerStand; afdeling: AfdelingStand; magBeheren: boolean; onKlaar: () => void }) {
  const [open, setOpen] = useState(false)
  const { kamer, bewoners, vrij } = stand
  const wijzig = useMutation({ mutationFn: (actief: boolean) => wijzigKamer(kamer.id, { actief }), onSuccess: onKlaar })
  const wis = useMutation({ mutationFn: () => wisKamer(kamer.id), onSuccess: onKlaar })
  const toewijzen = useMutation({
    mutationFn: (hh: string) => zetVerblijf(hh, afdeling.id, kamer.naam),
    onSuccess: () => {
      setOpen(false)
      onKlaar()
    },
  })
  const kandidaten = afdeling.zonderKamer

  return (
    <li
      className={`min-w-0 rounded-2xl border-[1.5px] p-3 ${
        !kamer.actief ? 'border-line bg-surface-soft opacity-70' : vrij > 0 ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
      }`}
    >
      <p className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-lg font-bold">
          <DoorOpen size={18} strokeWidth={1.75} aria-hidden="true" /> {kamer.naam}
        </span>
        <span className="flex items-center gap-1 text-xs text-ink-soft" title={`${kamer.bedden} bed(den)`}>
          <BedDouble size={14} strokeWidth={1.75} aria-hidden="true" /> {kamer.bedden}
        </span>
      </p>
      <ul className="mt-1 text-sm">
        {bewoners.map((b) => (
          <li key={b.household_id} className="truncate">
            <Link to={`/zorg/bewoner/${b.household_id}`} className="font-semibold hover:underline">
              {b.naam}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">
        {!kamer.actief ? 'buiten gebruik' : vrij > 0 ? (vrij === kamer.bedden ? 'vrij' : `${vrij} bed vrij`) : 'bezet'}
      </p>

      {magBeheren ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {kamer.actief && vrij > 0 && kandidaten.length > 0 ? (
            <button onClick={() => setOpen(!open)} aria-expanded={open} className={knopKlein}>
              Bewoner plaatsen
            </button>
          ) : null}
          {bewoners.length === 0 ? (
            <>
              <button onClick={() => wijzig.mutate(!kamer.actief)} className={knopKlein}>
                {kamer.actief ? 'Buiten gebruik' : 'In gebruik'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Kamer ${kamer.naam} wissen?`)) wis.mutate()
                }}
                aria-label={`Kamer ${kamer.naam} wissen`}
                className={knopKlein}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <ul className="mt-2 space-y-1">
          {kandidaten.map((b) => (
            <li key={b.household_id}>
              <button
                disabled={toewijzen.isPending}
                onClick={() => toewijzen.mutate(b.household_id)}
                className="w-full rounded-xl bg-surface px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-soft"
              >
                {b.naam}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Fout fout={wijzig.error ?? wis.error ?? toewijzen.error} />
    </li>
  )
}

function ZonderKamer({ b, afdeling, magBeheren, onKlaar }: { b: Bezetting; afdeling: AfdelingStand; magBeheren: boolean; onKlaar: () => void }) {
  const vrije = afdeling.kamers.filter((k) => k.kamer.actief && k.vrij > 0)
  const [kamer, setKamer] = useState('')
  const zet = useMutation({ mutationFn: () => zetVerblijf(b.household_id, afdeling.id, kamer), onSuccess: onKlaar })
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{b.naam}</span>
        {b.kamer ? <span className="text-sm text-ink-soft"> · kamer "{b.kamer}" bestaat niet op deze afdeling</span> : null}
      </span>
      {magBeheren && afdeling.id && vrije.length > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (kamer) zet.mutate()
          }}
          className="flex items-center gap-2"
        >
          <select value={kamer} onChange={(e) => setKamer(e.target.value)} aria-label={`Kamer voor ${b.naam}`} className="min-h-[2.5rem] rounded-xl border border-line-strong bg-surface px-2">
            <option value="">Kies een kamer</option>
            {vrije.map((k) => (
              <option key={k.kamer.id} value={k.kamer.naam}>
                {k.kamer.naam}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!kamer || zet.isPending} className={knopKlein}>
            Plaatsen
          </button>
        </form>
      ) : null}
      <Fout fout={zet.error} />
    </li>
  )
}

function KamersToevoegen({ orgId, afdelingen, onKlaar }: { orgId: string; afdelingen: { id: string; name: string }[]; onKlaar: () => void }) {
  const [afdeling, setAfdeling] = useState(afdelingen[0]?.id ?? '')
  const [reeks, setReeks] = useState('')
  const [bedden, setBedden] = useState(1)
  const namen = kamerReeks(reeks)
  const bewaar = useMutation({
    mutationFn: () => nieuweKamers(orgId, afdeling, namen, bedden),
    onSuccess: () => {
      setReeks('')
      onKlaar()
    },
  })
  return (
    <Kaart titel="Kamers toevoegen">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (namen.length) bewaar.mutate()
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <label>
          <span className={label}>Afdeling</span>
          <select value={afdeling} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
            {afdelingen.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Kamers</span>
          <input value={reeks} onChange={(e) => setReeks(e.target.value)} placeholder="101-120 of 12, 14, 16" className={veld} />
        </label>
        <label>
          <span className={label}>Bedden per kamer</span>
          <select value={bedden} onChange={(e) => setBedden(Number(e.target.value))} className={veld}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={!namen.length || bewaar.isPending} className={`${knop} w-full sm:w-auto`}>
            {bewaar.isPending ? 'Bezig…' : namen.length > 1 ? `${namen.length} kamers toevoegen` : 'Kamer toevoegen'}
          </button>
          <Fout fout={bewaar.error} />
        </div>
      </form>
    </Kaart>
  )
}
