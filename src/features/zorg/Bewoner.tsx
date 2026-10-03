import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Eye, Phone, TriangleAlert, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisatie } from './useOrganisatie'
import BerichtenVanBewoner from './BerichtenVanBewoner'
import BezoekVastleggen from '../bezoek/BezoekVastleggen'
import DitBenIkKaart from './DitBenIkKaart'
import UitstapKaart from '../uitstap/UitstapKaart'
import SpullenKaart from '../spullen/SpullenKaart'
import {
  CATEGORIEEN,
  agendaVandaag,
  alleBewoners,
  contacten,
  medewerkers,
  mijnBewoners,
  mijnLopendeNoodtoegang,
  noodInzage,
  nieuweZorgnotitie,
  startNoodtoegang,
  stopNoodtoegang,
  zorgnotities,
  type Categorie,
  type Zorgnotitie,
} from './zorgApi'
import { Fout, Kaart, Laden, Leeg, dagEnUur, knop, knopKlein, knopRustig, label, tekstvak, uur } from './ui'

export default function Bewoner() {
  const { hh = '' } = useParams()
  const { org } = useOrganisatie()
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  const orgId = org?.org_id ?? ''

  const mijn = useQuery({ queryKey: ['zorg', 'mijn-bewoners', orgId], enabled: !!orgId, queryFn: () => mijnBewoners(orgId) })
  const alle = useQuery({ queryKey: ['zorg', 'alle-bewoners', orgId], enabled: !!orgId, queryFn: () => alleBewoners(orgId) })
  const nood = useQuery({
    queryKey: ['zorg', 'nood', hh, ik],
    enabled: !!hh && !!ik,
    queryFn: () => mijnLopendeNoodtoegang(hh, ik),
  })

  const bewoner = mijn.data?.find((b) => b.household_id === hh) ?? alle.data?.find((b) => b.household_id === hh)
  const isMijn = !!mijn.data?.some((b) => b.household_id === hh)

  const terug = (
    <Link to="/zorg" className="inline-flex items-center gap-1.5 font-semibold text-accent-ink">
      <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" /> Bewoners
    </Link>
  )

  if (mijn.isLoading || alle.isLoading || nood.isLoading) return <Laden />

  const kop = (
    <header>
      {terug}
      <h1 className="mt-3 text-2xl font-bold tracking-tight">{bewoner?.naam ?? 'Bewoner'}</h1>
      <p className="mt-1 text-ink-soft">
        {[bewoner?.afdeling, bewoner?.kamer ? `kamer ${bewoner.kamer}` : null].filter(Boolean).join(' · ')}
      </p>
    </header>
  )

  if (isMijn) {
    return (
      <div className="space-y-6">
        {kop}
        <Dossier hh={hh} orgId={orgId} naam={bewoner?.naam.split(' ')[0] ?? 'de bewoner'} />
      </div>
    )
  }

  if (nood.data) {
    return (
      <div className="space-y-6">
        {kop}
        <NoodDossier id={nood.data} hh={hh} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {kop}
      {org?.team_lead ? (
        <NoodStart hh={hh} naam={bewoner?.naam ?? 'deze bewoner'} />
      ) : (
        <Leeg>Je bent niet toegewezen aan deze bewoner. Vraag het aan je coördinator.</Leeg>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
//  Het gewone dossier: vandaag, zorgnotities, contactpersonen
// ---------------------------------------------------------------------

function Dossier({ hh, orgId, naam }: { hh: string; orgId: string; naam: string }) {
  const agenda = useQuery({ queryKey: ['zorg', 'agenda', hh], queryFn: () => agendaVandaag(hh) })
  const mensen = useQuery({ queryKey: ['zorg', 'contacten', hh], queryFn: () => contacten(hh) })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <BerichtenVanBewoner hh={hh} naam={naam} />
        <DitBenIkKaart hh={hh} naam={naam} />
        <Notities hh={hh} orgId={orgId} />
      </div>
      <div className="space-y-6">
        <BezoekVastleggen householdId={hh} personName={naam} timezone="Europe/Brussels" vorm="zorgteam" />
        <UitstapKaart householdId={hh} personName={naam} timezone="Europe/Brussels" vorm="zorgteam" />
        <SpullenKaart householdId={hh} personName={naam} vorm="zorgteam" />
        <Kaart titel="Vandaag">
          {agenda.isLoading ? <Laden /> : null}
          {agenda.data && agenda.data.length === 0 ? <Leeg>Niets gepland vandaag.</Leeg> : null}
          <ul className="space-y-1.5">
            {(agenda.data ?? []).map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-2xl bg-surface-soft px-3 py-2">
                <time className="w-14 shrink-0 whitespace-nowrap font-semibold tabular-nums">{uur(e.starts_at)}</time>
                <span className="min-w-0 flex-1 break-words">{e.title}</span>
                {e.done_at ? (
                  <span className="inline-flex items-center gap-1 text-sm text-ok">
                    <Check size={15} strokeWidth={2} aria-hidden="true" /> gedaan
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Kaart>
        <Kaart titel={<><Users size={20} strokeWidth={1.75} aria-hidden="true" /> Contactpersonen</>}>
          {mensen.data && mensen.data.length === 0 ? <Leeg>Geen contactpersonen.</Leeg> : null}
          <ul className="space-y-1.5">
            {(mensen.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-soft px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-sm text-ink-soft">{p.relation}</span>
                </span>
                {p.phone ? (
                  <a href={`tel:${p.phone}`} className={knopKlein} aria-label={`Bel ${p.name}`}>
                    <Phone size={15} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Kaart>
      </div>
    </div>
  )
}

function Notities({ hh, orgId }: { hh: string; orgId: string }) {
  const queryClient = useQueryClient()
  const lijst = useQuery({ queryKey: ['zorg', 'notities', hh], queryFn: () => zorgnotities(hh) })
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', orgId], queryFn: () => medewerkers(orgId) })
  const namen = Object.fromEntries((team.data ?? []).map((m) => [m.profile_id, m.naam]))

  const [categorie, setCategorie] = useState<Categorie>('observatie')
  const [tekst, setTekst] = useState('')
  const [voorFamilie, setVoorFamilie] = useState(false)
  const [corrigeert, setCorrigeert] = useState<Zorgnotitie | null>(null)

  const bewaar = useMutation({
    mutationFn: () =>
      nieuweZorgnotitie({
        household_id: hh,
        category: categorie,
        body: tekst,
        visibility: voorFamilie ? 'familie' : 'team',
        vervangt: corrigeert?.id ?? null,
      }),
    onSuccess: () => {
      setTekst('')
      setVoorFamilie(false)
      setCorrigeert(null)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'notities', hh] })
    },
  })

  const vervangen = new Set((lijst.data ?? []).map((n) => n.vervangt).filter(Boolean))

  return (
    <Kaart titel="Zorgnotities">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (tekst.trim()) bewaar.mutate()
        }}
        className="rounded-2xl bg-surface-soft p-4"
      >
        {corrigeert ? (
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Correctie op:</span>
            <span className="min-w-0 flex-1 truncate text-ink-soft">{corrigeert.body}</span>
            <button type="button" onClick={() => setCorrigeert(null)} className={knopKlein}>
              Annuleren
            </button>
          </p>
        ) : null}
        <fieldset>
          <legend className="sr-only">Soort notitie</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIEEN.map((c) => (
              <button
                key={c.waarde}
                type="button"
                aria-pressed={categorie === c.waarde}
                onClick={() => setCategorie(c.waarde)}
                className={`rounded-pill px-3 py-1.5 text-sm font-semibold ${
                  categorie === c.waarde ? 'bg-accent-ink text-white' : 'border border-line bg-surface text-ink-soft'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block">
          <span className={label}>Wat zag of deed je?</span>
          <textarea
            required
            rows={3}
            maxLength={4000}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            className={tekstvak}
          />
        </label>
        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={voorFamilie}
            onChange={(e) => setVoorFamilie(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent-ink)]"
          />
          <span>
            <span className="font-semibold">Ook voor de familie</span>
            <span className="block text-sm text-ink-soft">
              Familie die mag meekijken en de bewoner zelf zien deze notitie. Anders blijft ze in het team.
            </span>
          </span>
        </label>
        <button type="submit" disabled={bewaar.isPending || !tekst.trim()} className={`${knop} mt-3 w-full sm:w-auto`}>
          {bewaar.isPending ? 'Bezig…' : corrigeert ? 'Correctie bewaren' : 'Notitie bewaren'}
        </button>
        <Fout fout={bewaar.error} />
      </form>

      <p className="mt-3 text-xs text-ink-faint">
        Een notitie kan je niet aanpassen of wissen. Klopt er iets niet, voeg dan een correctie toe.
      </p>

      {lijst.isLoading ? <Laden /> : null}
      {lijst.data && lijst.data.length === 0 ? <div className="mt-3"><Leeg>Nog geen zorgnotities.</Leeg></div> : null}
      <ul className="mt-3 space-y-2">
        {(lijst.data ?? []).map((n) => (
          <li
            key={n.id}
            className={`rounded-2xl border border-line px-4 py-3 ${vervangen.has(n.id) ? 'opacity-60' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold">{CATEGORIEEN.find((c) => c.waarde === n.category)?.label}</span>
              <span className="text-ink-faint">·</span>
              <time dateTime={n.created_at} className="text-ink-soft">{dagEnUur(n.created_at)}</time>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-soft">{(n.author_id && namen[n.author_id]) || 'Een collega'}</span>
              {n.visibility === 'familie' ? (
                <span className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">
                  <Eye size={13} strokeWidth={1.75} aria-hidden="true" /> ook familie
                </span>
              ) : null}
              {vervangen.has(n.id) ? <span className="text-xs font-semibold text-ink-faint">gecorrigeerd</span> : null}
              {n.vervangt ? <span className="text-xs font-semibold text-ink-faint">correctie</span> : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
            {!vervangen.has(n.id) ? (
              <button
                onClick={() => {
                  setCorrigeert(n)
                  setCategorie(n.category)
                  setVoorFamilie(n.visibility === 'familie')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="mt-1 text-sm font-semibold text-accent-ink underline underline-offset-4"
              >
                Corrigeren
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Kaart>
  )
}

// ---------------------------------------------------------------------
//  Noodtoegang
// ---------------------------------------------------------------------

function NoodStart({ hh, naam }: { hh: string; naam: string }) {
  const queryClient = useQueryClient()
  const [reden, setReden] = useState('')
  const start = useMutation({
    mutationFn: () => startNoodtoegang(hh, reden),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zorg', 'nood', hh] }),
  })
  const genoeg = reden.trim().length >= 20

  return (
    <Kaart titel={<><TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" /> Noodtoegang</>}>
      <p className="text-ink-soft">
        Je bent niet toegewezen aan {naam}. In een noodgeval kan je als team lead 4 uur meekijken: naam,
        voorkeuren, agenda, logboek, zorgnotities en contactpersonen. Geen dagboek, documenten of locatie.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
        <li>De familiebeheerder en de beheerder van je organisatie krijgen meteen bericht, met jouw reden.</li>
        <li>Elke keer dat je kijkt, wordt bijgehouden.</li>
        <li>Hoogstens 3 keer per 24 uur.</li>
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (genoeg) start.mutate()
        }}
        className="mt-4"
      >
        <label className="block">
          <span className={label}>Waarom heb je dit nu nodig?</span>
          <textarea
            rows={3}
            maxLength={500}
            value={reden}
            onChange={(e) => setReden(e.target.value)}
            placeholder="Bijvoorbeeld: gevallen in de gang, familie niet bereikbaar, nachtdienst zoekt de contactpersoon."
            className={tekstvak}
          />
        </label>
        <p className="mt-1 text-sm text-ink-faint">{genoeg ? 'Genoeg uitleg.' : `Nog ${20 - reden.trim().length} tekens.`}</p>
        <button type="submit" disabled={!genoeg || start.isPending} className={`${knop} mt-3 w-full sm:w-auto`}>
          {start.isPending ? 'Bezig…' : 'Noodtoegang starten'}
        </button>
        <Fout fout={start.error} />
      </form>
    </Kaart>
  )
}

function NoodDossier({ id, hh }: { id: string; hh: string }) {
  const queryClient = useQueryClient()
  // Elke oproep wordt gelogd: niet vanzelf verversen.
  const inzage = useQuery({
    queryKey: ['zorg', 'nood-inzage', id],
    queryFn: () => noodInzage(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  const stop = useMutation({
    mutationFn: () => stopNoodtoegang(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zorg', 'nood', hh] }),
  })

  const d = inzage.data
  return (
    <div className="space-y-6">
      <section className="rounded-card bg-surface p-5 shadow-card ring-2 ring-warn sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-bold">
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            Noodtoegang{d ? ` tot ${uur(d.noodtoegang.tot)}` : ''}
          </p>
          <button
            onClick={() => {
              if (confirm('Noodtoegang nu stoppen?')) stop.mutate()
            }}
            disabled={stop.isPending}
            className={`${knopRustig} w-full sm:w-auto`}
          >
            Nu stoppen
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">Elke keer dat je deze pagina opent, wordt bijgehouden.</p>
        <Fout fout={stop.error} />
      </section>

      {inzage.isLoading ? <Laden /> : null}
      <Fout fout={inzage.error} />
      {d ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Kaart titel="Contactpersonen">
            {d.contacten.length === 0 ? <Leeg>Geen contactpersonen.</Leeg> : null}
            <ul className="space-y-1.5">
              {d.contacten.map((c, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl bg-surface-soft px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{c.naam}</span>
                    <span className="block text-sm text-ink-soft">{c.relatie}</span>
                  </span>
                  {c.telefoon ? (
                    <a href={`tel:${c.telefoon}`} className={knopKlein}>
                      <Phone size={15} strokeWidth={1.75} aria-hidden="true" /> {c.telefoon}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Kaart>
          <Kaart titel="Voorkeuren">
            {d.voorkeuren.length === 0 ? <Leeg>Geen voorkeuren genoteerd.</Leeg> : null}
            <ul className="space-y-1.5">
              {d.voorkeuren.map((v, i) => (
                <li key={i} className="rounded-2xl bg-surface-soft px-3 py-2">
                  <span className="font-semibold">{v.titel}</span>
                  <span className="block text-sm text-ink-soft">{v.tekst}</span>
                </li>
              ))}
            </ul>
          </Kaart>
          <Kaart titel="Agenda vandaag en morgen">
            {d.agenda.length === 0 ? <Leeg>Niets gepland.</Leeg> : null}
            <ul className="space-y-1.5">
              {d.agenda.map((a, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-surface-soft px-3 py-2">
                  <time className="shrink-0 font-semibold tabular-nums">{dagEnUur(a.om)}</time>
                  <span className="min-w-0 flex-1">{a.titel}</span>
                </li>
              ))}
            </ul>
          </Kaart>
          <Kaart titel="Laatste 24 uur">
            {(d.zorgnotities ?? []).length + d.logboek.length === 0 ? <Leeg>Niets genoteerd.</Leeg> : null}
            <ul className="space-y-1.5">
              {(d.zorgnotities ?? []).map((n, i) => (
                <li key={`z${i}`} className="rounded-2xl bg-surface-soft px-3 py-2">
                  <span className="text-sm text-ink-soft">{dagEnUur(n.om)} · zorgnotitie</span>
                  <span className="block">{n.tekst}</span>
                </li>
              ))}
              {d.logboek.map((l, i) => (
                <li key={`l${i}`} className="rounded-2xl bg-surface-soft px-3 py-2">
                  <span className="text-sm text-ink-soft">{dagEnUur(l.om)} · logboek</span>
                  <span className="block">{l.titel}</span>
                  {l.notitie ? <span className="block text-sm text-ink-soft">{l.notitie}</span> : null}
                </li>
              ))}
            </ul>
          </Kaart>
        </div>
      ) : null}
      <p className="text-sm text-ink-faint">
        <Link to="/zorg" className="font-semibold text-accent-ink underline underline-offset-4">
          Terug naar de bewoners
        </Link>{' '}
        — de noodtoegang loopt door tot je ze stopt of tot ze afloopt.
      </p>
    </div>
  )
}
