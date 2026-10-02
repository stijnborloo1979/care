import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, CircleCheck, Copy, KeyRound, TriangleAlert, UserPlus, X } from 'lucide-react'
import { aandachtspunten, cijfers } from './overzicht'
import { MedewerkerActies, OpenUitnodigingen } from './BeheerTeam'
import VerblijfBeeindigen from './VerblijfBeeindigen'
import { useOrganisatie } from './useOrganisatie'
import { useAuth } from '../auth/AuthProvider'
import {
  ROLNAAM,
  actieveBewoners,
  afdelingen as haalAfdelingen,
  alleBewoners,
  haalVanAfdeling,
  koppelcode,
  medewerkers,
  nieuweAfdeling,
  nieuweKoppelcode,
  nodigUit,
  BEWAAR_OPTIES,
  bewaartermijn,
  bewaartermijnGevolg,
  termijnTekst,
  zetBewaartermijn,
  OVERDRACHT_OPTIES,
  dagenTekst,
  overdrachtTermijn,
  overdrachtTermijnGevolg,
  zetOverdrachtTermijn,
  teamberichtTermijn,
  teamberichtTermijnGevolg,
  zetTeamberichtTermijn,
  noodtoegangenVanOrg,
  openOrgUitnodigingen,
  stopToewijzing,
  toewijzingen,
  wijsToe,
  zetOpAfdeling,
  zetVerblijf,
  type Bewoner,
  type OrgRol,
} from './zorgApi'
import { Fout, Kaart, Kop, Laden, Leeg, dagEnUur, knop, knopKlein, knopRustig, label, veld } from './ui'

/**
 * Wat een beheerder of coördinator regelt: wie voor wie zorgt, waar een
 * bewoner verblijft, wie er werkt. Inhoud over bewoners staat hier niet;
 * die ziet alleen wie toegewezen is.
 */
export default function Beheer() {
  const { org, beheert, isBeheerder } = useOrganisatie()
  if (!org) return null
  if (!beheert) return <Navigate to="/zorg" replace />
  const orgId = org.org_id

  return (
    <div className="space-y-6">
      <Kop titel="Beheer" uitleg={`${org.naam} · ${ROLNAAM[org.rol]}`} />
      <Overzicht orgId={orgId} isBeheerder={isBeheerder} />
      <Koppelcode orgId={orgId} isBeheerder={isBeheerder} />
      <Toewijzingen orgId={orgId} />
      {isBeheerder ? <Medewerkers orgId={orgId} /> : null}
      {isBeheerder ? <OpenUitnodigingen orgId={orgId} /> : null}
      {isBeheerder ? <Afdelingen orgId={orgId} /> : null}
      <Bewaartermijn orgId={orgId} isBeheerder={isBeheerder} />
      <OverdrachtTermijn orgId={orgId} isBeheerder={isBeheerder} />
      <TeamberichtTermijn orgId={orgId} isBeheerder={isBeheerder} />
      {isBeheerder ? <Telling orgId={orgId} /> : null}
      {isBeheerder ? <Noodtoegangen orgId={orgId} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------

function Koppelcode({ orgId, isBeheerder }: { orgId: string; isBeheerder: boolean }) {
  const queryClient = useQueryClient()
  const code = useQuery({ queryKey: ['zorg', 'koppelcode', orgId], queryFn: () => koppelcode(orgId) })
  const nieuw = useMutation({
    mutationFn: () => nieuweKoppelcode(orgId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zorg', 'koppelcode', orgId] }),
  })
  const [gekopieerd, setGekopieerd] = useState(false)
  if (!code.data) return null
  const leesbaar = `${code.data.slice(0, 4)} ${code.data.slice(4)}`

  return (
    <Kaart titel={<><KeyRound size={20} strokeWidth={1.75} aria-hidden="true" /> Koppelcode voor familie</>}>
      <p className="text-ink-soft">
        Geef deze code aan de familie van een nieuwe bewoner. De familiebeheerder koppelt er zelf het huishouden
        mee, bij "Wie ziet wat". Een woonzorgcentrum kan nooit zelf een bewoner toevoegen.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-2xl bg-surface-soft px-5 py-3 font-mono text-2xl font-bold tracking-[0.2em]">{leesbaar}</span>
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(code.data!)
            setGekopieerd(true)
            setTimeout(() => setGekopieerd(false), 2000)
          }}
          className={knopRustig}
        >
          <Copy size={16} strokeWidth={1.75} aria-hidden="true" /> {gekopieerd ? 'Gekopieerd' : 'Kopiëren'}
        </button>
        {isBeheerder ? (
          <button
            onClick={() => {
              if (confirm('Een nieuwe code maken? De oude werkt dan niet meer.')) nieuw.mutate()
            }}
            className="text-sm font-semibold text-ink-soft underline underline-offset-4"
          >
            Nieuwe code
          </button>
        ) : null}
      </div>
      <Fout fout={nieuw.error} />
    </Kaart>
  )
}

// ---------------------------------------------------------------------

/**
 * Bovenaan: hoe staat het ervoor, en wat vraagt aandacht. Alleen wie waar
 * verblijft en wie voor wie zorgt; nooit inhoud over een bewoner.
 */
function Overzicht({ orgId, isBeheerder }: { orgId: string; isBeheerder: boolean }) {
  const bewoners = useQuery({ queryKey: ['zorg', 'alle-bewoners', orgId], queryFn: () => alleBewoners(orgId) })
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', orgId], queryFn: () => medewerkers(orgId) })
  const toe = useQuery({ queryKey: ['zorg', 'toewijzingen', orgId], queryFn: () => toewijzingen(orgId) })
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId) })
  const inv = useQuery({
    queryKey: ['zorg', 'open-uitnodigingen', orgId],
    enabled: isBeheerder,
    queryFn: () => openOrgUitnodigingen(orgId),
  })

  if (bewoners.isLoading || team.isLoading || toe.isLoading || afd.isLoading) return <Kaart><Laden /></Kaart>

  const invoer = {
    bewoners: bewoners.data ?? [],
    toewijzingen: toe.data ?? [],
    medewerkers: team.data ?? [],
    afdelingen: afd.data ?? [],
    uitnodigingen: isBeheerder ? inv.data ?? null : null,
  }
  const c = cijfers(invoer)
  const punten = aandachtspunten(invoer)
  const tegels: [string, number | null][] = [
    ['Bewoners', c.bewoners],
    ['Medewerkers', c.medewerkers],
    ['Afdelingen', c.afdelingen],
    ['Open uitnodigingen', c.uitnodigingen],
  ]

  return (
    <Kaart titel="Overzicht">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tegels
          .filter(([, n]) => n !== null)
          .map(([t, n]) => (
            <div key={t} className="min-w-0 rounded-2xl bg-surface-soft p-4">
              <dt className="truncate text-sm text-ink-soft">{t}</dt>
              <dd className="text-3xl font-bold tabular-nums">{n}</dd>
            </div>
          ))}
      </dl>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-faint">Vraagt aandacht</h3>
      {punten.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">
          <CircleCheck size={18} strokeWidth={1.75} className="shrink-0 text-accent-ink" aria-hidden="true" />
          Alles in orde: elke bewoner wordt gevolgd en heeft een plaats.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {punten.slice(0, 8).map((p) => (
            <li key={p.sleutel} className="flex items-start gap-3 rounded-2xl bg-surface-soft px-4 py-3">
              <TriangleAlert
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className={`mt-0.5 shrink-0 ${p.ernst === 'hoog' ? 'text-alert' : 'text-ink-faint'}`}
              />
              <span className="min-w-0">
                {p.ernst === 'hoog' ? <span className="sr-only">Belangrijk: </span> : null}
                {p.tekst}
              </span>
            </li>
          ))}
          {punten.length > 8 ? <li className="px-4 text-sm text-ink-soft">En nog {punten.length - 8} andere.</li> : null}
        </ul>
      )}
    </Kaart>
  )
}

// ---------------------------------------------------------------------

function Toewijzingen({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const bewoners = useQuery({ queryKey: ['zorg', 'alle-bewoners', orgId], queryFn: () => alleBewoners(orgId) })
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', orgId], queryFn: () => medewerkers(orgId) })
  const toe = useQuery({ queryKey: ['zorg', 'toewijzingen', orgId], queryFn: () => toewijzingen(orgId) })
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId) })
  const [zoek, setZoek] = useState('')

  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ['zorg', 'toewijzingen', orgId] })
    queryClient.invalidateQueries({ queryKey: ['zorg', 'mijn-bewoners', orgId] })
  }
  const toewijzen = useMutation({ mutationFn: (p: { hh: string; profiel: string }) => wijsToe(p.hh, p.profiel), onSuccess: ververs })
  const stoppen = useMutation({ mutationFn: stopToewijzing, onSuccess: ververs })

  const namen = Object.fromEntries((team.data ?? []).map((m) => [m.profile_id, m.naam]))
  // Jezelf toewijzen kan niet (53): dan ook niet aanbieden.
  const ik = useAuth().session?.user.id
  const zorgers = (team.data ?? []).filter((m) => m.actief && m.rol !== 'org_admin' && m.profile_id !== ik)
  const lijst = (bewoners.data ?? []).filter(
    (b) => !zoek || `${b.naam} ${b.afdeling ?? ''} ${b.kamer ?? ''}`.toLowerCase().includes(zoek.toLowerCase()),
  )

  return (
    <Kaart titel="Bewoners en wie voor hen zorgt">
      <p className="text-sm text-ink-soft">
        Wie toegewezen is, ziet de agenda, de zorgnotities en de contactpersonen van die bewoner. Een team lead ziet
        alle bewoners van zijn afdeling.
      </p>
      {(bewoners.data ?? []).length > 6 ? (
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek een bewoner"
          className={`${veld} max-w-md`}
        />
      ) : null}
      {bewoners.isLoading ? <Laden /> : null}
      {bewoners.data && bewoners.data.length === 0 ? (
        <div className="mt-3">
          <Leeg>Nog geen bewoners. Een bewoner verschijnt hier zodra de familie koppelt met de code hierboven.</Leeg>
        </div>
      ) : null}
      <ul className="mt-3 space-y-3">
        {lijst.map((b) => {
          const mijnToe = (toe.data ?? []).filter((t) => t.household_id === b.household_id)
          const al = new Set(mijnToe.map((t) => t.profile_id))
          return (
            <li key={b.household_id} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{b.naam}</p>
                  <Verblijf bewoner={b} afdelingen={afd.data ?? []} orgId={orgId} />
                </div>
                <VerblijfBeeindigen orgId={orgId} hh={b.household_id} naam={b.naam.split(' ')[0]} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {mijnToe.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-pill bg-accent-soft py-1 pl-3 pr-1 text-sm font-semibold text-accent-ink">
                    {namen[t.profile_id] ?? 'Medewerker'}
                    <button
                      onClick={() => stoppen.mutate(t.id)}
                      aria-label={`Toewijzing van ${namen[t.profile_id] ?? 'medewerker'} stoppen`}
                      className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface"
                    >
                      <X size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => e.target.value && toewijzen.mutate({ hh: b.household_id, profiel: e.target.value })}
                  aria-label={`Medewerker toewijzen aan ${b.naam}`}
                  className="min-h-[2.25rem] rounded-pill border border-line bg-surface px-3 text-sm font-semibold text-ink-soft"
                >
                  <option value="">+ Toewijzen</option>
                  {zorgers.filter((m) => !al.has(m.profile_id)).map((m) => (
                    <option key={m.profile_id} value={m.profile_id}>
                      {m.naam}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          )
        })}
      </ul>
      <Fout fout={toewijzen.error ?? stoppen.error} />
    </Kaart>
  )
}

function Verblijf({ bewoner, afdelingen, orgId }: { bewoner: Bewoner; afdelingen: { id: string; name: string }[]; orgId: string }) {
  const queryClient = useQueryClient()
  const [bewerk, setBewerk] = useState(false)
  const [afdeling, setAfdeling] = useState(afdelingen.find((a) => a.name === bewoner.afdeling)?.id ?? '')
  const [kamer, setKamer] = useState(bewoner.kamer ?? '')
  const bewaar = useMutation({
    mutationFn: () => zetVerblijf(bewoner.household_id, afdeling || null, kamer),
    onSuccess: () => {
      setBewerk(false)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'alle-bewoners', orgId] })
    },
  })

  if (!bewerk) {
    return (
      <p className="text-sm text-ink-soft">
        {[bewoner.afdeling ? `Afdeling ${bewoner.afdeling}` : 'Geen afdeling', bewoner.kamer ? `kamer ${bewoner.kamer}` : null]
          .filter(Boolean)
          .join(' · ')}{' '}
        <button onClick={() => setBewerk(true)} className="font-semibold text-accent-ink underline underline-offset-4">
          aanpassen
        </button>
      </p>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        bewaar.mutate()
      }}
      className="mt-2 flex flex-wrap items-end gap-2"
    >
      <label>
        <span className={label}>Afdeling</span>
        <select value={afdeling} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
          <option value="">Geen</option>
          {afdelingen.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="w-28">
        <span className={label}>Kamer</span>
        <input value={kamer} onChange={(e) => setKamer(e.target.value)} className={veld} />
      </label>
      <button type="submit" disabled={bewaar.isPending} className={knop}>
        Bewaren
      </button>
      <button type="button" onClick={() => setBewerk(false)} className={knopRustig}>
        Annuleren
      </button>
      <Fout fout={bewaar.error} />
    </form>
  )
}

// ---------------------------------------------------------------------

function Medewerkers({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', orgId], queryFn: () => medewerkers(orgId) })
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId) })
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ['zorg', 'medewerkers', orgId] })
    queryClient.invalidateQueries({ queryKey: ['organisaties'] })
  }
  const opAfdeling = useMutation({
    mutationFn: (p: { afdeling: string; profiel: string; rol: 'team_lead' | 'staff' }) => zetOpAfdeling(p.afdeling, p.profiel, p.rol),
    onSuccess: ververs,
  })
  const vanAfdeling = useMutation({ mutationFn: haalVanAfdeling, onSuccess: ververs })

  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<OrgRol>('caregiver')
  const [link, setLink] = useState<string | null>(null)
  const [gemaild, setGemaild] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)
  const uitnodigen = useMutation({
    mutationFn: () => nodigUit(orgId, email, rol),
    onSuccess: (r) => {
      setLink(r.link)
      setGemaild(r.gemaild)
      setEmail('')
    },
  })

  return (
    <Kaart titel="Medewerkers">
      {team.isLoading ? <Laden /> : null}
      <ul className="space-y-2">
        {(team.data ?? []).map((m) => (
          <li key={m.profile_id} className={`rounded-2xl bg-surface-soft px-4 py-3 ${m.actief ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold">{m.naam}</span>
              <span className="text-sm text-ink-soft">
                {ROLNAAM[m.rol]}
                {m.actief ? '' : ' · niet actief'}
              </span>
              {m.email ? <span className="min-w-0 truncate text-sm text-ink-faint">{m.email}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {m.afdelingen.map((a) => (
                <span key={a.rij} className="inline-flex items-center gap-1 rounded-pill bg-surface py-1 pl-3 pr-1 text-sm">
                  {a.naam}
                  {a.rol === 'team_lead' ? <strong className="ml-1">team lead</strong> : null}
                  <button
                    onClick={() => vanAfdeling.mutate(a.rij)}
                    aria-label={`${m.naam} van afdeling ${a.naam} halen`}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface-soft"
                  >
                    <X size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {/* Een beheerder staat nooit op een afdeling: hij ziet geen inhoud (J4). */}
              {m.actief && m.rol !== 'org_admin' && (afd.data ?? []).length > 0 ? (
                <select
                  value=""
                  onChange={(e) => {
                    const [afdeling, r] = e.target.value.split('|')
                    if (afdeling) opAfdeling.mutate({ afdeling, profiel: m.profile_id, rol: r as 'team_lead' | 'staff' })
                  }}
                  aria-label={`${m.naam} op een afdeling zetten`}
                  className="min-h-[2.25rem] rounded-pill border border-line bg-surface px-3 text-sm font-semibold text-ink-soft"
                >
                  <option value="">+ Afdeling</option>
                  {(afd.data ?? [])
                    .filter((a) => !m.afdelingen.some((x) => x.id === a.id))
                    .flatMap((a) => [
                      <option key={`${a.id}s`} value={`${a.id}|staff`}>
                        {a.name}
                      </option>,
                      <option key={`${a.id}t`} value={`${a.id}|team_lead`}>
                        {a.name} (team lead)
                      </option>,
                    ])}
                </select>
              ) : null}
            </div>
            <MedewerkerActies orgId={orgId} m={m} />
          </li>
        ))}
      </ul>
      <Fout fout={opAfdeling.error ?? vanAfdeling.error} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setLink(null)
          uitnodigen.mutate()
        }}
        className="mt-5 rounded-2xl border border-line p-4"
      >
        <h3 className="flex items-center gap-2 font-bold">
          <UserPlus size={18} strokeWidth={1.75} aria-hidden="true" /> Medewerker uitnodigen
        </h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1">
            <span className={label}>E-mailadres</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={veld} />
          </label>
          <label>
            <span className={label}>Rol</span>
            <select value={rol} onChange={(e) => setRol(e.target.value as OrgRol)} className={veld}>
              <option value="caregiver">Zorgmedewerker</option>
              <option value="coordinator">Coördinator</option>
              <option value="org_admin">Beheerder</option>
            </select>
          </label>
          <button type="submit" disabled={uitnodigen.isPending} className={knop}>
            Uitnodiging maken
          </button>
        </div>
        <Fout fout={uitnodigen.error} />
        {link ? (
          <div className="mt-3 rounded-2xl bg-surface-soft p-3">
            <p className="text-sm text-ink-soft">
              {gemaild
                ? 'De uitnodiging is gemaild. Je kan de link ook zelf doorsturen.'
                : 'Stuur deze link naar de medewerker.'}{' '}
              Hij werkt alleen voor wie inlogt met dat e-mailadres, 14 dagen lang.
            </p>
            <p className="mt-1 break-all font-mono text-sm">{link}</p>
            <button
              onClick={async () => {
                await navigator.clipboard?.writeText(link)
                setGekopieerd(true)
              }}
              className={`${knopKlein} mt-2`}
            >
              {gekopieerd ? 'Gekopieerd' : 'Link kopiëren'}
            </button>
          </div>
        ) : null}
      </form>
    </Kaart>
  )
}

function Afdelingen({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId) })
  const [naam, setNaam] = useState('')
  const maak = useMutation({
    mutationFn: () => nieuweAfdeling(orgId, naam),
    onSuccess: () => {
      setNaam('')
      queryClient.invalidateQueries({ queryKey: ['zorg', 'afdelingen', orgId] })
    },
  })
  return (
    <Kaart titel="Afdelingen">
      <div className="flex flex-wrap gap-2">
        {(afd.data ?? []).map((a) => (
          <span key={a.id} className="rounded-pill bg-surface-soft px-3 py-1.5 font-semibold">
            {a.name}
          </span>
        ))}
        {afd.data && afd.data.length === 0 ? <Leeg>Nog geen afdelingen.</Leeg> : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (naam.trim()) maak.mutate()
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="min-w-[12rem] flex-1">
          <span className={label}>Nieuwe afdeling</span>
          <input maxLength={80} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="De Eik" className={veld} />
        </label>
        <button type="submit" disabled={!naam.trim() || maak.isPending} className={knop}>
          Toevoegen
        </button>
      </form>
      <Fout fout={maak.error} />
    </Kaart>
  )
}

function Telling({ orgId }: { orgId: string }) {
  const nu = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const van = `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-01`
  const tot = `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}`
  const telling = useQuery({ queryKey: ['zorg', 'telling', orgId, van, tot], queryFn: () => actieveBewoners(orgId, van, tot) })
  const rijen = telling.data ?? []
  if (rijen.length === 0) return null
  const vandaag = rijen[rijen.length - 1]?.aantal ?? 0
  const dagen = rijen.reduce((s, r) => s + Number(r.aantal), 0)
  return (
    <Kaart titel="Actieve bewoners">
      <p className="text-ink-soft">Een bewoner telt op elke dag met een lopend verblijf, niet op hoe vaak de app gebruikt wordt.</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-soft p-4">
          <dt className="text-sm text-ink-soft">Vandaag</dt>
          <dd className="text-3xl font-bold tabular-nums">{vandaag}</dd>
        </div>
        <div className="rounded-2xl bg-surface-soft p-4">
          <dt className="text-sm text-ink-soft">Bewonersdagen deze maand</dt>
          <dd className="text-3xl font-bold tabular-nums">{dagen}</dd>
        </div>
      </dl>
    </Kaart>
  )
}

function Noodtoegangen({ orgId }: { orgId: string }) {
  const lijst = useQuery({ queryKey: ['zorg', 'noodtoegangen', orgId], queryFn: () => noodtoegangenVanOrg(orgId) })
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', orgId], queryFn: () => medewerkers(orgId) })
  const bewoners = useQuery({ queryKey: ['zorg', 'alle-bewoners', orgId], queryFn: () => alleBewoners(orgId) })
  const namen = Object.fromEntries((team.data ?? []).map((m) => [m.profile_id, m.naam]))
  const bew = Object.fromEntries((bewoners.data ?? []).map((b) => [b.household_id, b.naam]))
  if (!lijst.data || lijst.data.length === 0) return null
  return (
    <Kaart titel={<><TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" /> Noodtoegang</>}>
      <ul className="space-y-2">
        {lijst.data.map((n) => {
          const loopt = !n.ended_at && new Date(n.expires_at) > new Date()
          return (
            <li key={n.id} className={`rounded-2xl bg-surface-soft px-4 py-3 ${loopt ? 'ring-2 ring-warn' : ''}`}>
              <p className="font-semibold">
                {namen[n.profile_id] ?? 'Een team lead'} → {bew[n.household_id] ?? 'een bewoner'}
              </p>
              <p className="text-sm text-ink-soft">
                {dagEnUur(n.started_at)} · {loopt ? 'loopt nog' : n.ended_at ? 'gestopt' : 'afgelopen'}
              </p>
              <p className="mt-1 break-words">„{n.reason}”</p>
            </li>
          )
        })}
      </ul>
    </Kaart>
  )
}

function Bewaartermijn({ orgId, isBeheerder }: { orgId: string; isBeheerder: boolean }) {
  const queryClient = useQueryClient()
  const termijn = useQuery({ queryKey: ['zorg', 'bewaartermijn', orgId], queryFn: () => bewaartermijn(orgId) })
  const [melding, setMelding] = useState<string | null>(null)
  const zet = useMutation({
    mutationFn: async (maanden: number) => {
      const gevolg = await bewaartermijnGevolg(orgId, maanden)
      if (
        gevolg > 0 &&
        !confirm(
          `Met ${termijnTekst(maanden)} worden ${gevolg} ${gevolg === 1 ? 'notitie' : 'notities'} van bewoners die lang geleden vertrokken binnen de week gewist. Doorgaan?`,
        )
      )
        return null
      await zetBewaartermijn(orgId, maanden)
      return maanden
    },
    onSuccess: (m) => {
      if (m === null) return
      setMelding(`Bewaard: ${termijnTekst(m)}.`)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'bewaartermijn', orgId] })
    },
  })
  if (termijn.data == null) return null

  return (
    <Kaart titel={<><Archive size={20} strokeWidth={1.75} aria-hidden="true" /> Bewaartermijn zorgnotities</>}>
      <p className="text-ink-soft">
        Zolang een bewoner hier woont, blijven de zorgnotities bewaard. Na het vertrek worden ze na deze termijn
        automatisch gewist. De termijn geldt ook voor wie al vertrokken is, gerekend vanaf het vertrek.
      </p>
      {isBeheerder ? (
        <label className="mt-3 block max-w-xs">
          <span className={label}>Bewaren na vertrek</span>
          <select
            value={termijn.data}
            disabled={zet.isPending}
            onChange={(e) => {
              setMelding(null)
              zet.mutate(Number(e.target.value))
            }}
            className={veld}
          >
            {BEWAAR_OPTIES.map((m) => (
              <option key={m} value={m}>
                {termijnTekst(m)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 text-lg font-semibold">{termijnTekst(termijn.data)} na vertrek</p>
      )}
      {melding ? <p className="mt-2 text-sm font-semibold text-accent-ink">{melding}</p> : null}
      <Fout fout={zet.error} />
    </Kaart>
  )
}

function OverdrachtTermijn({ orgId, isBeheerder }: { orgId: string; isBeheerder: boolean }) {
  const queryClient = useQueryClient()
  const termijn = useQuery({ queryKey: ['zorg', 'overdracht-termijn', orgId], queryFn: () => overdrachtTermijn(orgId) })
  const [melding, setMelding] = useState<string | null>(null)
  const zet = useMutation({
    mutationFn: async (dagen: number) => {
      const gevolg = await overdrachtTermijnGevolg(orgId, dagen)
      if (
        gevolg > 0 &&
        !confirm(
          `Met ${dagenTekst(dagen)} verdwijnen vannacht ${gevolg} ${gevolg === 1 ? 'oudere overdracht' : 'oudere overdrachten'}. Doorgaan?`,
        )
      )
        return null
      await zetOverdrachtTermijn(orgId, dagen)
      return dagen
    },
    onSuccess: (d) => {
      if (d === null) return
      setMelding(`Bewaard: ${dagenTekst(d)}.`)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'overdracht-termijn', orgId] })
    },
  })
  if (termijn.data == null) return null

  return (
    <Kaart titel={<><Archive size={20} strokeWidth={1.75} aria-hidden="true" /> Bewaartermijn overdracht</>}>
      <p className="text-ink-soft">
        Een overdracht gaat over een dienst. Ze wordt elke nacht gewist zodra ze ouder is dan deze termijn. Wat blijvend
        belangrijk is over een bewoner, hoort in een zorgnotitie.
      </p>
      {isBeheerder ? (
        <label className="mt-3 block max-w-xs">
          <span className={label}>Bewaren</span>
          <select
            value={termijn.data}
            disabled={zet.isPending}
            onChange={(e) => {
              setMelding(null)
              zet.mutate(Number(e.target.value))
            }}
            className={veld}
          >
            {OVERDRACHT_OPTIES.map((d) => (
              <option key={d} value={d}>
                {dagenTekst(d)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 text-lg font-semibold">{dagenTekst(termijn.data)}</p>
      )}
      {melding ? <p className="mt-2 text-sm font-semibold text-accent-ink">{melding}</p> : null}
      <Fout fout={zet.error} />
    </Kaart>
  )
}

function TeamberichtTermijn({ orgId, isBeheerder }: { orgId: string; isBeheerder: boolean }) {
  const queryClient = useQueryClient()
  const termijn = useQuery({ queryKey: ['zorg', 'team-termijn', orgId], queryFn: () => teamberichtTermijn(orgId) })
  const [melding, setMelding] = useState<string | null>(null)
  const zet = useMutation({
    mutationFn: async (dagen: number) => {
      const gevolg = await teamberichtTermijnGevolg(orgId, dagen)
      if (gevolg > 0 && !confirm(`Met ${dagenTekst(dagen)} verdwijnen vannacht ${gevolg} oudere teamberichten. Doorgaan?`))
        return null
      await zetTeamberichtTermijn(orgId, dagen)
      return dagen
    },
    onSuccess: (d) => {
      if (d === null) return
      setMelding(`Bewaard: ${dagenTekst(d)}.`)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'team-termijn', orgId] })
    },
  })
  if (termijn.data == null) return null

  return (
    <Kaart titel={<><Archive size={20} strokeWidth={1.75} aria-hidden="true" /> Bewaartermijn teamberichten</>}>
      <p className="text-ink-soft">Teamberichten worden elke nacht gewist zodra ze ouder zijn dan deze termijn.</p>
      {isBeheerder ? (
        <label className="mt-3 block max-w-xs">
          <span className={label}>Bewaren</span>
          <select
            value={termijn.data}
            disabled={zet.isPending}
            onChange={(e) => {
              setMelding(null)
              zet.mutate(Number(e.target.value))
            }}
            className={veld}
          >
            {OVERDRACHT_OPTIES.map((d) => (
              <option key={d} value={d}>
                {dagenTekst(d)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-3 text-lg font-semibold">{dagenTekst(termijn.data)}</p>
      )}
      {melding ? <p className="mt-2 text-sm font-semibold text-accent-ink">{melding}</p> : null}
      <Fout fout={zet.error} />
    </Kaart>
  )
}
