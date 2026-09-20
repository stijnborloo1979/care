import { useState } from 'react'
import { useHousehold } from '../household/useHousehold'
import { useLastLocation, useLocationSetting } from './useLocation'

/**
 * Locatie staat uit tot iemand er uitdrukkelijk mee instemt, en wie de
 * app gebruikt ziet altijd dat het aan staat. Dat is het verschil tussen
 * een hulpmiddel en toezicht.
 */
export default function LocationSettings() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const voornaam = household?.person_name.split(' ')[0] ?? 'de persoon'
  const { setting, zet } = useLocationSetting(hh)
  const { data: laatste } = useLastLocation(hh, !!setting?.enabled)
  const [fout, setFout] = useState<string | null>(null)

  function zetAan() {
    setFout(null)
    if (!navigator.geolocation) {
      setFout('Dit toestel kan geen locatie bepalen.')
      return
    }
    // Het huis is waar de persoon woont, dus bepalen we de zone op het
    // toestel dat daar staat.
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        zet.mutate({
          aan: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radius: setting?.radius_m ?? 500,
        }),
      () => setFout('Toestemming voor locatie geweigerd in de browser.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const aan = !!setting?.enabled

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Locatie</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Staat uit tot iemand er toestemming voor geeft. {voornaam} ziet altijd wanneer het aan
        staat, en kan het zelf uitzetten.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-pill border px-3 py-1 text-sm font-semibold ${
            aan ? 'border-ok text-ok' : 'border-line text-ink-soft'
          }`}
        >
          {aan ? 'Aan' : 'Uit'}
        </span>

        {aan ? (
          <button
            onClick={() => zet.mutate({ aan: false })}
            className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            Uitzetten
          </button>
        ) : (
          <button
            onClick={zetAan}
            className="min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white"
          >
            Aanzetten, met dit huis als veilige zone
          </button>
        )}
      </div>

      {aan ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-line bg-surface-soft p-4 text-sm">
          <p>
            Veilige zone: {setting?.radius_m ?? 500} meter rond het huis. Familie krijgt één melding
            wanneer die zone verlaten wordt, niet bij elk punt erbuiten.
          </p>
          {laatste ? (
            <p className="text-ink-soft">
              Laatst gemeten {new Date(laatste.at).toLocaleString('nl-BE')} —{' '}
              {laatste.inside_zone === false ? 'buiten de zone' : 'in de zone'}
            </p>
          ) : (
            <p className="text-ink-soft">Nog geen positie doorgegeven.</p>
          )}
          <p className="text-ink-faint">
            Posities worden na zeven dagen gewist. Er wordt niets bijgehouden zolang dit uit staat.
          </p>
        </div>
      ) : null}

      {fout ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
