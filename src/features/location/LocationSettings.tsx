import { useState } from 'react'
import { useHousehold } from '../household/useHousehold'
import { useVerblijf } from '../zorg/useVerblijf'
import { useLastLocation, useLocationSetting } from './useLocation'
import { tt, uiLocale } from '../../lib/uiTaal'

/**
 * Locatie staat uit tot iemand er uitdrukkelijk mee instemt, en wie de
 * app gebruikt ziet altijd dat het aan staat. Dat is het verschil tussen
 * een hulpmiddel en toezicht.
 */
export default function LocationSettings() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const voornaam = household?.person_name.split(' ')[0] ?? tt('de persoon')
  const { setting, zet } = useLocationSetting(hh)
  const { data: laatste } = useLastLocation(hh, !!setting?.enabled)
  const [fout, setFout] = useState<string | null>(null)
  // In een woonzorgcentrum ligt de zone rond de oude woning: gepauzeerd (109).
  const { verblijf } = useVerblijf(hh)

  function zetAan() {
    setFout(null)
    if (!navigator.geolocation) {
      setFout(tt('Dit toestel kan geen locatie bepalen.'))
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
      () => setFout(tt('Toestemming voor locatie geweigerd in de browser.')),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const aan = !!setting?.enabled

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Locatie')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {tt('Staat uit tot iemand er toestemming voor geeft. {voornaam} ziet altijd wanneer het aan staat, en kan het zelf uitzetten.', { voornaam })}
      </p>

      {verblijf ? (
        <p className="mt-3 rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">
          {tt('Gepauzeerd zolang {voornaam} in {wzc} woont. Er wordt geen locatie bewaard en er komt geen melding over de veilige zone. Na het verblijf werkt het weer zoals ingesteld.', { voornaam, wzc: verblijf.naam })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-pill border px-3 py-1 text-sm font-semibold ${
            aan ? 'border-ok text-ok' : 'border-line text-ink-soft'
          }`}
        >
          {aan ? tt('Aan') : tt('Uit')}
        </span>

        {aan ? (
          <button
            onClick={() => zet.mutate({ aan: false })}
            className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            {tt('Uitzetten')}
          </button>
        ) : (
          <button
            onClick={zetAan}
            className="min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white"
          >
            {tt('Aanzetten, met dit huis als veilige zone')}
          </button>
        )}
      </div>

      {aan ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-line bg-surface-soft p-4 text-sm">
          <p>
            {tt('Veilige zone: {m} meter rond het huis. Familie krijgt één melding wanneer die zone verlaten wordt, niet bij elk punt erbuiten.', { m: setting?.radius_m ?? 500 })}
          </p>
          {laatste ? (
            <p className="text-ink-soft">
              {laatste.inside_zone === false
                ? tt('Laatst gemeten {wanneer} — buiten de zone', { wanneer: new Date(laatste.at).toLocaleString(uiLocale()) })
                : tt('Laatst gemeten {wanneer} — in de zone', { wanneer: new Date(laatste.at).toLocaleString(uiLocale()) })}
            </p>
          ) : (
            <p className="text-ink-soft">{tt('Nog geen positie doorgegeven.')}</p>
          )}
          <p className="text-ink-faint">
            {tt('Posities worden na zeven dagen gewist. Er wordt niets bijgehouden zolang dit uit staat.')}
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
