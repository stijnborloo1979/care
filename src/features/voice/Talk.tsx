import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { confirmMoments } from '../../services/medsToday'
import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { huidigePrefs } from '../settings/useDisplayPrefs'
import { VOORBEELDVRAGEN, beantwoord, type Answer } from './answerEngine'
import { useKennis } from './useKennis'
import { spreek, useSpeech } from './useSpeech'

export default function Talk() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { kennis } = useKennis(hh, tz)
  const [antwoord, setAntwoord] = useState<Answer | null>(null)
  const [zoekt, setZoekt] = useState(false)
  const [bevestigd, setBevestigd] = useState(false)
  const queryClient = useQueryClient()

  async function neemNu(ids: string[]) {
    await confirmMoments(ids)
    setBevestigd(true)
    await queryClient.invalidateQueries({ queryKey: ['meds-today', hh] })
    await queryClient.invalidateQueries({ queryKey: ['summary', hh] })
    if (huidigePrefs().voice) spreek('Goed. Ik heb genoteerd dat je je medicatie genomen hebt.')
  }

  function toon(a: Answer) {
    setBevestigd(false)
    setAntwoord(a)
    if (huidigePrefs().voice) spreek([a.titel, ...a.regels].join('. '))
  }

  async function vraag(tekst: string) {
    // Laag 1: de eigen regels. Die dekken de vragen uit de brief, kosten
    // niets en werken offline.
    const a = beantwoord(tekst, kennis)
    if (!a.titel.startsWith('Dat weet ik niet zeker')) {
      toon(a)
      return
    }

    // Laag 2 en 3: zoeken in de eigen gegevens, en pas bij een treffer
    // een model laten formuleren. Geen treffer blijft "dat weet ik niet".
    setAntwoord(a)
    setZoekt(true)
    try {
      const { data, error } = await supabase.functions.invoke('ask', {
        body: { household_id: hh, vraag: tekst },
      })
      if (error || !data?.titel) return
      toon({
        vraag: tekst,
        titel: data.titel,
        regels: data.regels ?? [],
        bron: (data.bronnen ?? [])[0],
      })
    } catch {
      // Edge function niet aanwezig of geen verbinding: het antwoord van
      // laag 1 blijft gewoon staan.
    } finally {
      setZoekt(false)
    }
  }

  const { start, luistert, fout, beschikbaar } = useSpeech(vraag)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6 text-center">
      <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">Praat met mij</h1>
      <p className="mt-1 text-lg text-ink-soft">Stel een vraag over vandaag of over je huis.</p>

      <button
        onClick={start}
        aria-label="Druk om te praten"
        className={`mx-auto mt-8 grid h-36 w-36 place-items-center rounded-full bg-accent-ink text-5xl text-white shadow-lift ${
          luistert ? 'animate-pulse' : ''
        }`}
      >
        🎤
      </button>
      <p className="mt-3 text-ink-soft">
        {luistert
          ? 'Ik luister…'
          : beschikbaar
            ? 'Druk op de knop en stel je vraag.'
            : 'Tik hieronder een vraag aan.'}
      </p>
      {fout ? (
        <p role="alert" className="mt-2 text-alert">
          {fout}
        </p>
      ) : null}

      {antwoord ? (
        <div className="mt-7 rounded-card border border-line bg-surface p-5 text-left shadow-card">
          <p className="text-base font-bold text-ink-faint">{antwoord.vraag}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight">{antwoord.titel}</p>
          {zoekt ? <p className="mt-2 text-lg text-ink-faint">Ik kijk het even na…</p> : null}
          {antwoord.regels.map((r, i) => (
            <p key={i} className="mt-2 text-lg text-ink-soft">
              {r}
            </p>
          ))}

          {antwoord.bron ? (
            <p className="mt-3 text-sm text-ink-faint">Genoteerd door je familie: {antwoord.bron}</p>
          ) : null}

          {antwoord.bevestig && antwoord.bevestig.length > 0 ? (
            bevestigd ? (
              <p className="mt-4 rounded-2xl bg-accent-soft p-3 text-lg font-semibold text-accent-ink">
                Genoteerd. Je familie ziet het ook.
              </p>
            ) : (
              <button
                onClick={() => neemNu(antwoord.bevestig!)}
                className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
              >
                Ik heb ze nu genomen
              </button>
            )
          ) : null}

          {antwoord.bellen ? (
            <a
              href={`tel:${antwoord.bellen.nummer.replace(/\s/g, '')}`}
              className="mt-4 flex min-h-touch items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
            >
              📞 Bel {antwoord.bellen.naam}
            </a>
          ) : null}

          {antwoord.link ? (
            <Link
              to={antwoord.link.naar}
              className="mt-4 flex min-h-touch items-center justify-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
            >
              {antwoord.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="mt-8 text-left">
        <h2 className="text-base font-bold text-ink-faint">Of tik een vraag aan</h2>
        <ul className="mt-3 space-y-2">
          {VOORBEELDVRAGEN.map((q) => (
            <li key={q}>
              <button
                onClick={() => vraag(q)}
                className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left text-lg shadow-card"
              >
                <span aria-hidden="true">💬</span>
                <span className="flex-1">{q}</span>
                <span className="text-ink-faint" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm text-ink-faint">
        Ik antwoord alleen met wat je familie heeft ingevuld. Weet ik het niet, dan zeg ik dat.
      </p>
    </main>
  )
}
