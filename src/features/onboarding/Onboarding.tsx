import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  STANDAARD_KAMERS,
  STANDAARD_OCHTEND,
  addFirstItem,
  addPersonCards,
  createHousehold,
  createRooms,
  createRoutine,
} from '../../services/onboarding'

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
  const queryClient = useQueryClient()

  const [voorWie, setVoorWie] = useState<'zelf' | 'familielid'>('familielid')
  const [naam, setNaam] = useState('')
  const [adres, setAdres] = useState('')
  const [mensen, setMensen] = useState<Persoon[]>([LEEG, LEEG, LEEG])
  const [routine, setRoutine] = useState(
    STANDAARD_OCHTEND.map((s) => `${s.at} ${s.title}`).join('\n'),
  )
  const [kamers, setKamers] = useState<string[]>(STANDAARD_KAMERS.map((k) => k.name))
  const [dingNaam, setDingNaam] = useState('Koffiezetapparaat')
  const [dingKamer, setDingKamer] = useState('Keuken')
  const [dingWaar, setDingWaar] = useState('')
  const [dingStappen, setDingStappen] = useState('')

  async function afronden() {
    setBusy(true)
    setError(null)
    try {
      const hh = await createHousehold(naam.trim(), adres.trim())

      await addPersonCards(hh, mensen)

      const stappen = routine
        .split('\n')
        .map((r) => r.trim().match(/^(\d{1,2}[:.]\d{2})\s+(.*)$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => ({ at: m[1].replace('.', ':').padStart(5, '0'), title: m[2] }))

      if (stappen.length > 0) {
        await createRoutine(hh, 'Dagelijks', stappen)
      }

      const gemaakt = await createRooms(hh, kamers)

      const kamer = gemaakt.find((k) => k.name === dingKamer) ?? gemaakt[0]
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
      setError(e instanceof Error ? e.message : 'Er ging iets mis. Probeer het opnieuw.')
      setBusy(false)
    }
  }

  const stappen = [
    {
      titel: 'Voor wie is deze app?',
      onder: 'Dat bepaalt welk scherm je straks ziet.',
      inhoud: (
        <div className="space-y-3">
          {(
            [
              { w: 'zelf', em: '🌷', label: 'Ik gebruik de app zelf' },
              { w: 'familielid', em: '👨‍👩‍👧', label: 'Ik zorg voor een familielid' },
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
      titel: 'Over wie gaat het?',
      onder: 'De naam die op het scherm komt te staan.',
      inhoud: (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-ink-soft">Naam</span>
            <input
              autoFocus
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder="Maria Janssens"
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-soft">Adres, mag leeg blijven</span>
            <input
              value={adres}
              onChange={(e) => setAdres(e.target.value)}
              placeholder="Lindestraat 12, Herent"
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
          </label>
          <p className="text-sm text-ink-faint">
            Het adres verschijnt op het hulpscherm, als antwoord op "waar ben ik?".
          </p>
        </div>
      ),
      verplicht: !naam.trim(),
    },
    {
      titel: 'Wie is er belangrijk?',
      onder: 'Drie volstaat om te beginnen. Later kan je er meer toevoegen en uitnodigen.',
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
                placeholder="Naam"
                className="min-h-touch min-w-[7rem] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
              <input
                value={m.relation}
                onChange={(e) => {
                  const kopie = [...mensen]
                  kopie[i] = { ...m, relation: e.target.value }
                  setMensen(kopie)
                }}
                placeholder="Dochter"
                className="min-h-touch min-w-[7rem] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
              <input
                value={m.phone}
                onChange={(e) => {
                  const kopie = [...mensen]
                  kopie[i] = { ...m, phone: e.target.value }
                  setMensen(kopie)
                }}
                placeholder="Telefoon"
                inputMode="tel"
                className="min-h-touch min-w-[7rem] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
            </div>
          ))}
          <button
            onClick={() => setMensen([...mensen, LEEG])}
            className="font-semibold text-accent-ink underline underline-offset-4"
          >
            Nog iemand
          </button>
        </div>
      ),
    },
    {
      titel: 'De dagelijkse routine',
      onder: 'Eén regel per moment, beginnend met het uur. Pas aan wat niet klopt.',
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
      titel: 'Welke kamers zijn er?',
      onder: 'Tik weg wat er niet is.',
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
                {k.emoji} {k.name}
              </button>
            )
          })}
        </div>
      ),
    },
    {
      titel: 'Eén ding om te onthouden',
      onder: 'Begin met wat het vaakst gezocht wordt of niet meer lukt.',
      inhoud: (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={dingNaam}
              onChange={(e) => setDingNaam(e.target.value)}
              placeholder="Koffiezetapparaat"
              className="min-h-touch min-w-[10rem] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
            <select
              value={dingKamer}
              onChange={(e) => setDingKamer(e.target.value)}
              className="min-h-touch min-w-[9rem] rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            >
              {kamers.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <input
            value={dingWaar}
            onChange={(e) => setDingWaar(e.target.value)}
            placeholder="Op het aanrecht, rechts van de gootsteen."
            className="min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
          <textarea
            value={dingStappen}
            onChange={(e) => setDingStappen(e.target.value)}
            rows={4}
            placeholder={'Vul het waterreservoir.\nZet een kopje onder de tuit.\nDruk op de grote knop.'}
            className="w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
          />
        </div>
      ),
    },
  ]

  const s = stappen[stap]
  const laatste = stap === stappen.length - 1

  return (
    <main className="mx-auto max-w-[34rem] px-5 py-10">
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
            Terug
          </button>
        ) : null}

        <button
          onClick={() => (laatste ? afronden() : setStap(stap + 1))}
          disabled={busy || s.verplicht}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Bezig…' : laatste ? 'Klaar' : 'Verder'}
        </button>
      </div>

      {!laatste && stap > 1 ? (
        <button
          onClick={() => setStap(stap + 1)}
          className="mt-4 w-full text-center font-semibold text-ink-faint underline underline-offset-4"
        >
          Deze stap overslaan
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-5 rounded-2xl border border-alert bg-surface-soft p-3 text-alert">
          {error}
        </p>
      ) : null}
    </main>
  )
}
