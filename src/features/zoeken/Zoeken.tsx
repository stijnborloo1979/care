import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { useHousehold } from '../household/useHousehold'
import { useKennis } from '../voice/useKennis'
import { beantwoord, type Answer } from '../voice/answerEngine'
import { tt } from '../../lib/uiTaal'
import { t } from '../../lib/i18n'

/**
 * Zoeken op de eigen gegevens: dezelfde antwoordlogica als de spraakassistent,
 * maar getypt. Geen model erbij: wat er niet in de eigen gegevens staat, wordt
 * niet verzonnen.
 */
export default function Zoeken() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { kennis } = useKennis(hh, tz, household?.home_id ?? hh)
  const [tekst, setTekst] = useState('')
  const [antwoord, setAntwoord] = useState<Answer | null>(null)

  function zoek(e: React.FormEvent) {
    e.preventDefault()
    const vraag = tekst.trim()
    if (!vraag) return
    setAntwoord(beantwoord(vraag, kennis))
  }

  const nietGevonden = antwoord !== null && antwoord.titel === t('ass.nietZeker')

  return (
    <main className="mx-auto max-w-[44rem] space-y-6 px-5 pb-28 pt-6">
      <Link to="/" className="inline-flex min-h-touch items-center gap-2 text-xl font-semibold text-ink-soft">
        <Icon naam="terug" size={28} />
        {tt('Terug')}
      </Link>
      <h1 className="text-4xl font-extrabold tracking-tight">{tt('Zoeken')}</h1>

      <form onSubmit={zoek} className="flex gap-3">
        <input
          type="search"
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          placeholder={tt('Typ wat je zoekt, bijvoorbeeld: bril')}
          aria-label={tt('Zoeken')}
          className="min-h-big min-w-0 flex-1 rounded-card border-2 border-line bg-surface px-6 text-2xl"
        />
        <button type="submit" className="min-h-big rounded-pill bg-accent px-8 text-2xl font-bold text-accent-ink">
          {tt('Zoek')}
        </button>
      </form>

      {antwoord ? (
        <section className="space-y-4 rounded-card bg-surface p-6 shadow-card" aria-live="polite">
          <h2 className="text-3xl font-extrabold">{nietGevonden ? tt('Niets gevonden. Probeer een ander woord.') : antwoord.titel}</h2>
          {!nietGevonden
            ? antwoord.regels.map((r) => (
                <p key={r} className="text-2xl text-ink-soft">
                  {r}
                </p>
              ))
            : null}
          {!nietGevonden && antwoord.link ? (
            <Link to={antwoord.link.naar} className="inline-flex min-h-big items-center rounded-pill bg-accent px-8 text-2xl font-bold text-accent-ink">
              {antwoord.link.label}
            </Link>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
