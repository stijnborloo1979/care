import { useEffect, useState } from 'react'
import { tt } from '../../lib/uiTaal'

/**
 * Hoeveel plaats de bewaarde foto's innemen, en een knop om ze weg te doen.
 *
 * Waarom dit bestaat: op één telefoon stond een gigabyte. De knop die Chrome
 * daarvoor aanbiedt — "Gegevens verwijderen en rechten resetten" — doet veel
 * meer dan opruimen: die gooit ook de aanmelding weg en, op de tablet van de
 * persoon, de koppeling met het huishouden. Dan staat er een leeg scherm waar
 * niemand iets van begrijpt.
 *
 * Deze knop raakt alleen de bewaarde bestanden. Foto's en berichten komen
 * daarna gewoon opnieuw van de server; het enige verschil is dat de eerste
 * keer kijken weer even duurt.
 */
const CACHES = ['thuis-media', 'thuis-berichten']

function leesbaar(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}

export default function Opslag() {
  const [gebruikt, setGebruikt] = useState<number | null>(null)
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState(false)

  async function meet() {
    try {
      const schatting = await navigator.storage?.estimate?.()
      setGebruikt(typeof schatting?.usage === 'number' ? schatting.usage : null)
    } catch {
      setGebruikt(null)
    }
  }

  useEffect(() => {
    meet()
  }, [])

  async function ruimOp() {
    setBezig(true)
    try {
      // Alleen de bestandscaches. Niet caches.keys() in het wild leeggooien:
      // daar zit ook de app zelf in, en die weghalen betekent een wit scherm
      // tot de volgende keer dat er verbinding is.
      await Promise.all(CACHES.map((naam) => caches.delete(naam)))
      setKlaar(true)
      await meet()
    } catch {
      // Geen cache-ondersteuning of geweigerd: dan valt er niets op te ruimen.
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Opslag op dit toestel')}</h2>
      <p className="mt-1 max-w-[62ch] text-ink-soft">
        {tt("Foto's en ingesproken berichten blijven bewaard, zodat ze ook zonder wifi te zien zijn. Dat loopt op. Opruimen kan altijd: alles komt daarna gewoon opnieuw van de server, alleen duurt de eerste keer kijken dan weer even.")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {gebruikt !== null ? (
          <span className="text-2xl font-bold tabular-nums">{leesbaar(gebruikt)}</span>
        ) : null}

        <button
          onClick={ruimOp}
          disabled={bezig}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
        >
          {bezig ? tt('Bezig…') : tt('Bewaarde foto’s opruimen')}
        </button>
      </div>

      {klaar ? (
        <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
          {tt('Opgeruimd.')}
        </p>
      ) : null}

      <p className="mt-3 max-w-[62ch] text-sm text-ink-faint">
        {tt('Gebruik hiervoor niet de knop van de browser zelf ("Gegevens verwijderen en rechten resetten"). Die wist ook de aanmelding, en op de tablet de koppeling met dit huishouden.')}
      </p>
    </section>
  )
}
