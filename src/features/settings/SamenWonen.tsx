import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHouseholds } from '../household/useHousehold'
import { kiesHuisgenoten, samenvattingInWoorden, zetHuisgenoot } from '../../services/huis'
import { tt } from '../../lib/uiTaal'

/**
 * "Woont samen met" — één keuken voor twee mensen.
 *
 * Deze instelling staat bij familie en niet bij de persoon, en ze vraagt
 * bewust naar iets heel concreets: woont deze persoon in hetzelfde huis als
 * iemand anders voor wie je zorgt? Niet "wil je data delen" — dat is een
 * vraag waarvan niemand de gevolgen kan inschatten.
 *
 * Wat er gedeeld wordt is alleen het huis: kamers, apparaten, waar dingen
 * liggen, hoe ze werken. Niet de personen, de herinneringen, de medicatie,
 * de agenda of het zorglogboek. Dat staat er ook zo bij, want dit is het
 * soort knop waarvan familie precies moet weten wat hij doet voor ze hem
 * indrukken.
 */
export default function SamenWonen({ hh }: { hh: string }) {
  const { data: alle } = useHouseholds()
  const queryClient = useQueryClient()
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [vraagLos, setVraagLos] = useState(false)

  const dit = (alle ?? []).find((h) => h.household_id === hh)
  if (!dit || dit.role !== 'admin') return null

  const gedeeld = dit.home_id !== dit.household_id
  const voornaam = dit.person_name.split(' ')[0] || dit.person_name

  const kandidaten = kiesHuisgenoten(hh, alle ?? [])

  async function doe(van: string | null) {
    setBezig(true)
    setFout(null)
    setMelding(null)
    try {
      const uitkomst = await zetHuisgenoot(hh, van)
      setMelding(samenvattingInWoorden(uitkomst))
      await queryClient.invalidateQueries({ queryKey: ['households'] })
      await queryClient.invalidateQueries({ queryKey: ['rooms'] })
      await queryClient.invalidateQueries({ queryKey: ['items'] })
    } catch (e) {
      setFout(e instanceof Error ? e.message : tt('Dat lukte niet.'))
    } finally {
      setBezig(false)
      setVraagLos(false)
    }
  }

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Woont samen')}</h2>
      <p className="mt-1 max-w-[62ch] text-ink-soft">
        {tt('Woont {voornaam} in hetzelfde huis als iemand anders voor wie je zorgt? Dan is er één keuken, en hoef je de wasmachine maar één keer uit te leggen.', { voornaam })}
      </p>

      <p className="mt-3 max-w-[62ch] text-sm text-ink-faint">
        {tt('Gedeeld wordt alleen het huis: kamers, apparaten, waar dingen liggen en hoe ze werken. Niet de familie, de herinneringen, de medicatie, de agenda of het zorglogboek — die blijven per persoon.')}
      </p>

      {gedeeld ? (
        <div className="mt-4 rounded-2xl border-[1.5px] border-line-strong bg-surface-soft p-4">
          <p className="font-semibold">
            {tt('{voornaam} woont in huis bij {bij}.', { voornaam, bij: dit.home_name ?? tt('iemand anders') })}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {tt('Home Memory is voor beiden hetzelfde. Wat je aan de keuken wijzigt, zien ze allebei.')}
          </p>

          {vraagLos ? (
            <div className="mt-4">
              <p className="text-sm">
                {tt('Als je losmaakt, blijven de kamers en apparaten bij {bij} staan. {voornaam} begint dan met een leeg Home Memory.', { voornaam, bij: dit.home_name ?? tt('het andere huishouden') })}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={() => doe(null)}
                  disabled={bezig}
                  className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
                >
                  {tt('Toch losmaken')}
                </button>
                <button
                  onClick={() => setVraagLos(false)}
                  className="min-h-touch rounded-pill px-5 font-semibold text-ink-soft"
                >
                  {tt('Laat maar')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setVraagLos(true)}
              className="mt-3 min-h-touch rounded-pill border border-line px-5 font-semibold"
            >
              {tt('Losmaken')}
            </button>
          )}
        </div>
      ) : kandidaten.length === 0 ? (
        <p className="mt-4 text-ink-soft">
          {tt('Je beheert nog geen tweede huishouden dat op zichzelf woont. Zodra dat er is, kan je het hier samenvoegen.')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {kandidaten.map((k) => (
            <li
              key={k.household_id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4"
            >
              <span className="min-w-[min(10rem,100%)] flex-1 font-semibold">{k.person_name}</span>
              <button
                onClick={() => doe(k.household_id)}
                disabled={bezig}
                className="min-h-touch shrink-0 rounded-pill border-[1.5px] border-accent bg-accent-soft px-5 font-semibold disabled:opacity-60"
              >
                {tt('Zelfde huis')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Wat er gebeurd is, met de aantallen erbij: de vraag na zo'n knop is
          altijd "is er niets verdwenen?" */}
      {melding ? (
        <p className="mt-4 rounded-2xl bg-accent-soft p-4 font-semibold text-accent-ink">
          {melding}
        </p>
      ) : null}
      {fout ? (
        <p role="alert" className="mt-4 font-semibold text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
