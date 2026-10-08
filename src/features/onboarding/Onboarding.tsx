import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { useOrganisatiesKlaar } from '../zorg/useOrganisatie'
import { useQueryClient } from '@tanstack/react-query'
import ZorgToegang from '../zorg/ZorgToegang'
import LaadFout, { Diagnose } from '../household/LaadFout'
import { useAuth } from '../auth/AuthProvider'
import {
  STANDAARD_KAMERS,
  STANDAARD_OCHTEND,
  addFirstItem,
  addPersonCards,
  createHousehold,
  createRooms,
  createRoutine,
} from '../../services/onboarding'
import { tt } from '../../lib/uiTaal'

type Persoon = { name: string; relation: string; phone: string }

const LEEG: Persoon = { name: '', relation: '', phone: '' }

/**
 * Zes korte stappen, allemaal over te slaan. Een lang formulier vooraf is
 * precies wat mensen doet afhaken, en alles hier kan later nog in het
 * familiescherm. Alleen de naam is verplicht.
 */
export default function Onboarding() {
  const [stap, setStap] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const queryClient = useQueryClient()

  // Geen standaardkeuze: of je de app zelf gebruikt of voor iemand anders,
  // bepaalt wie eigenaar wordt. Dat moet een bewuste keuze zijn.
  const [voorWie, setVoorWie] = useState<'zelf' | 'familielid' | null>(null)
  const { all: huishoudens, isLoading: huisLaden, isError: huisFout, error: huisFoutMelding, refetch: huisOpnieuw } = useHousehold()
  const organisaties = useOrganisatiesKlaar()
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [mensen, setMensen] = useState<Persoon[]>([LEEG, LEEG, LEEG])
  const [routine, setRoutine] = useState(
    STANDAARD_OCHTEND.map((s) => `${s.at} ${tt(s.title)}`).join('\n'),
  )
  const [kamers, setKamers] = useState<string[]>(STANDAARD_KAMERS.map((k) => k.name))
  const [dingNaam, setDingNaam] = useState(tt('Koffiezetapparaat'))
  const [dingKamer, setDingKamer] = useState('Keuken')
  const [dingWaar, setDingWaar] = useState('')
  const [dingStappen, setDingStappen] = useState('')

  async function afronden() {
    setBusy(true)
    setError(null)
    try {
      // Wie de app zelf gebruikt, wordt eigenaar van zijn eigen huishouden
      // en start in de zelfstandige fase. Familie komt er later bij, op
      // uitnodiging.
      const hh = await createHousehold(naam.trim(), adres.trim(), voorWie === 'zelf')

      await addPersonCards(hh, mensen)

      const stappen = routine
        .split('\n')
        .map((r) => r.trim().match(/^(\d{1,2}[:.]\d{2})\s+(.*)$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => ({ at: m[1].replace('.', ':').padStart(5, '0'), title: m[2] }))

      if (stappen.length > 0) {
        await createRoutine(hh, tt('Dagelijks'), stappen)
      }

      // De kamers bewaren in de taal van het scherm: zo staan ze ook zo op de tablet.
      const gemaakt = await createRooms(hh, kamers.map((k) => tt(k)))

      const kamer = gemaakt.find((k) => k.name === tt(dingKamer)) ?? gemaakt[0]
      if (kamer && dingNaam.trim() && dingWaar.trim()) {
        await addFirstItem({
          householdId: hh,
          roomId: kamer.id,
          name: dingNaam,
          where: dingWaar,
          steps: dingStappen.split('\n'),
        })
      }

      // Eerst het nieuwe huishouden echt ophalen, dan pas doorsturen. Alleen
      // invalideren volstond niet: op dit scherm keek niemand naar die
      // query, dus werd hij niet ververst en kwam de oude lege lijst eerst.
      await queryClient.refetchQueries({ queryKey: ['households'], type: 'all' })
      navigate(voorWie === 'zelf' ? '/' : '/familie', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : tt('Er ging iets mis. Probeer het opnieuw.'))
      setBusy(false)
    }
  }

  const stappen = [
    {
      titel: tt('Voor wie is deze app?'),
      onder: tt('Dat bepaalt wie de app beheert en welk scherm je straks ziet.'),
      verplicht: voorWie === null,
      inhoud: (
        <div className="space-y-3">
          {(
            [
              { w: 'zelf', em: '🌷', label: tt('Ik gebruik de app zelf') },
              { w: 'familielid', em: '👨‍👩‍👧', label: tt('Ik zorg voor een familielid') },
            ] as const
          ).map((o) => (
            <button
              key={o.w}
              onClick={() => setVoorWie(o.w)}
              aria-pressed={voorWie === o.w}
              className={`flex min-h-[5rem] w-full items-center gap-4 rounded-card border-[1.5px] px-5 text-xl font-bold ${
                voorWie === o.w
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line-strong bg-surface'
              }`}
            >
              <span className="text-3xl" aria-hidden="true">
                {o.em}
              </span>
              {o.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      titel: voorWie === 'zelf' ? tt('Hoe heet je?') : tt('Over wie gaat het?'),
      onder:
        voorWie === 'zelf'
          ? tt('Zo spreekt de app je aan.')
          : tt('De naam die op het scherm komt te staan.'),
      inhoud: (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-ink-soft">{tt('Naam')}</span>
            <input
              autoFocus
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder={tt('Maria Janssens')}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-soft">{tt('Adres, mag leeg blijven')}</span>
            <input
              value={adres}
              onChange={(e) => setAdres(e.target.value)}
              placeholder={tt('Lindestraat 12, Herent')}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
          </label>
          <p className="text-sm text-ink-faint">
            {tt('Het adres verschijnt op het hulpscherm, als antwoord op "waar ben ik?".')}
          </p>
        </div>
      ),
      verplicht: !naam.trim(),
    },
    {
      titel: tt('Wie is er belangrijk?'),
      onder: tt('Drie volstaat om te beginnen. Later kan je er meer toevoegen en uitnodigen.'),
      inhoud: (
        <div className="space-y-4">
          {mensen.map((m, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                value={m.name}
                onChange={(e) => {
                  const kopie = [...mensen]
                  kopie[i] = { ...m, name: e.target.value }
                  setMensen(kopie)
                }}
                placeholder={tt('Naam')}
                className="min-h-touch min-w-[min(7rem,100%)] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
              <input
                value={m.relation}
                onChange={(e) => {
                  const kopie = [...mensen]
                  kopie[i] = { ...m, relation: e.target.value }
                  setMensen(kopie)
                }}
                placeholder={tt('Dochter')}
                className="min-h-touch min-w-[min(7rem,100%)] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
              <input
                value={m.phone}
                onChange={(e) => {
                  const kopie = [...mensen]
                  kopie[i] = { ...m, phone: e.target.value }
                  setMensen(kopie)
                }}
                placeholder={tt('Telefoon')}
                inputMode="tel"
                className="min-h-touch min-w-[min(7rem,100%)] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
            </div>
          ))}
          <button
            onClick={() => setMensen([...mensen, LEEG])}
            className="font-semibold text-accent-ink underline underline-offset-4"
          >
            {tt('Nog iemand')}
          </button>
        </div>
      ),
    },
    {
      titel: tt('De dagelijkse routine'),
      onder: tt('Eén regel per moment, beginnend met het uur. Pas aan wat niet klopt.'),
      inhoud: (
        <textarea
          value={routine}
          onChange={(e) => setRoutine(e.target.value)}
          rows={7}
          className="w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3 font-mono"
        />
      ),
    },
    {
      titel: tt('Welke kamers zijn er?'),
      onder: tt('Tik weg wat er niet is.'),
      inhoud: (
        <div className="flex flex-wrap gap-2">
          {STANDAARD_KAMERS.map((k) => {
            const aan = kamers.includes(k.name)
            return (
              <button
                key={k.name}
                onClick={() =>
                  setKamers(aan ? kamers.filter((n) => n !== k.name) : [...kamers, k.name])
                }
                aria-pressed={aan}
                className={`min-h-[3rem] rounded-pill border-[1.5px] px-5 font-semibold ${
                  aan
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line-strong bg-surface text-ink-faint'
                }`}
              >
                {k.emoji} {tt(k.name)}
              </button>
            )
          })}
        </div>
      ),
    },
    {
      titel: tt('Eén ding om te onthouden'),
      onder: tt('Begin met wat het vaakst gezocht wordt of niet meer lukt.'),
      inhoud: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={dingNaam}
              onChange={(e) => setDingNaam(e.target.value)}
              placeholder={tt('Koffiezetapparaat')}
              className="min-h-touch min-w-[min(10rem,100%)] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
            <select
              value={dingKamer}
              onChange={(e) => setDingKamer(e.target.value)}
              className="min-h-touch min-w-[min(9rem,100%)] rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            >
              {kamers.map((k) => (
                <option key={k} value={k}>{tt(k)}</option>
              ))}
            </select>
          </div>
          <input
            value={dingWaar}
            onChange={(e) => setDingWaar(e.target.value)}
            placeholder={tt('Op het aanrecht, rechts van de gootsteen.')}
            className="min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
          <textarea
            value={dingStappen}
            onChange={(e) => setDingStappen(e.target.value)}
            rows={4}
            placeholder={tt('Vul het waterreservoir.\nZet een kopje onder de tuit.\nDruk op de grote knop.')}
            className="w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
          />
        </div>
      ),
    },
  ]

  const s = stappen[stap]
  const laatste = stap === stappen.length - 1

  // Wie al een huishouden heeft, hoort hier niet: meteen de app in.
  if (!huisLaden && huishoudens.length > 0 && !busy) return <Navigate to="/" replace />
  // Een fout is geen nieuwe gebruiker. Niet de onboarding tonen, wel zeggen wat er is.
  if (!huisLaden && huisFout && !busy)
    return <LaadFout error={huisFoutMelding} onOpnieuw={() => huisOpnieuw()} />

  // Een medewerker van een woonzorgcentrum zonder eigen familie hoort hier niet.
  if (!huisLaden && !organisaties.isLoading && huishoudens.length === 0 && organisaties.lijst.length > 0 && !busy)
    return <Navigate to="/zorg" replace />

  return (
    <main className="mx-auto max-w-[34rem] px-5 py-10">
      {stap === 0 ? <ZorgToegang vorm="kaart" /> : null}
      <div className="flex gap-1.5">
        {stappen.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-pill ${i <= stap ? 'bg-accent' : 'bg-surface-deep'}`}
          />
        ))}
      </div>

      <h1 className="mt-7 text-[1.9rem] font-extrabold leading-tight tracking-tight">{s.titel}</h1>
      <p className="mt-1 text-lg text-ink-soft">{s.onder}</p>

      <div className="mt-7">{s.inhoud}</div>

      <div className="mt-8 flex flex-wrap gap-3">
        {stap > 0 ? (
          <button
            onClick={() => setStap(stap - 1)}
            className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            {tt('Terug')}
          </button>
        ) : null}

        <button
          onClick={() => (laatste ? afronden() : setStap(stap + 1))}
          disabled={busy || s.verplicht}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? tt('Bezig…') : laatste ? tt('Klaar') : tt('Verder')}
        </button>
      </div>

      {stap === 0 ? (
        <Link
          to="/zorg/nieuw"
          className="mt-6 block text-center font-semibold text-ink-faint underline underline-offset-4"
        >
          {tt('Ik registreer een woonzorgcentrum')}
        </Link>
      ) : null}

      {!laatste && stap > 1 ? (
        <button
          onClick={() => setStap(stap + 1)}
          className="mt-4 w-full text-center font-semibold text-ink-faint underline underline-offset-4"
        >
          {tt('Deze stap overslaan')}
        </button>
      ) : null}

      {/* Wie met het verkeerde adres inlogde, of hier niet hoort, moet weg
          kunnen zonder eerst een huishouden aan te maken. */}
      <p className="mt-10 text-center text-sm text-ink-faint">
        {tt('Je bent nu ingelogd als')}{' '}
        <span className="break-all font-semibold">{session?.user.email}</span>.{' '}
        <button onClick={() => signOut()} className="font-semibold underline underline-offset-4">
          {tt('Uitloggen')}
        </button>
      </p>

      {error ? (
        <p role="alert" className="mt-5 rounded-2xl border border-alert bg-surface-soft p-3 text-alert">
          {error}
        </p>
      ) : null}
      {stap === 0 ? (
        <Diagnose
          email={session?.user.email}
          id={session?.user.id}
          aantal={huisLaden ? undefined : huishoudens.length}
          melding={huisFout ? String((huisFoutMelding as Error)?.message ?? huisFoutMelding) : 'geen'}
        />
      ) : null}
    </main>
  )
}
