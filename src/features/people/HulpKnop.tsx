import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { vraagHulp } from '../../services/calls'
import { t } from '../../lib/i18n'

/**
 * "Ik heb hulp nodig" — familie meteen laten weten.
 *
 * Dit is geen noodnummer en mag er nooit voor doorgaan. Het staat er omdat
 * een toestel zonder telefoon niet kan bellen, en omdat iemand die op Help
 * drukt wél iets moet kunnen doen dat écht gebeurt.
 *
 * Daarom is hij bewust niet rood en staat hij onder het 112-blok. Rood en
 * bovenaan zou hem tot noodknop maken, en dat is hij niet. Wat hij wel
 * doet, zegt hij letterlijk: familie krijgt een bericht.
 *
 * In een woonzorgcentrum (wzc) is het andersom: dan gaat de vraag naar
 * iedereen van de afdeling (109) en is dit wél de hoofdweg. Dan staat hij
 * bovenaan, vol, en zegt hij wat er gebeurt: de verpleging weet het.
 *
 * Na het drukken verdwijnt de knop niet. Wie ongerust is, drukt nog eens;
 * de wachttijd van twee minuten zit in de database, niet hier. Op het
 * scherm staat alleen wat er gebeurd is.
 */
export default function HulpKnop({ householdId, wzc = false }: { householdId: string; wzc?: boolean }) {
  const [gevraagd, setGevraagd] = useState(false)

  const vraag = useMutation({
    mutationFn: () => vraagHulp(householdId),
    onSuccess: () => setGevraagd(true),
  })

  return (
    <div>
      <button
        onClick={() => vraag.mutate()}
        disabled={vraag.isPending}
        className={`flex w-full items-center gap-4 rounded-card border-[1.5px] border-accent px-5 text-left text-xl font-bold shadow-card disabled:opacity-60 ${
          wzc ? 'min-h-big bg-accent text-accent-ink' : 'min-h-[5rem] bg-accent-soft'
        }`}
      >
        <span className="text-3xl" aria-hidden="true">
          🔔
        </span>
        {vraag.isPending ? t('algemeen.bezig') : wzc ? t('hulp.wzcVraag') : t('hulp.laatWeten')}
      </button>

      {gevraagd ? (
        <p aria-live="polite" className="mt-2 text-lg font-semibold text-ok">
          {wzc ? t('hulp.wzcVerstuurd') : t('hulp.verstuurd')}
        </p>
      ) : null}

      {vraag.isError ? (
        <p role="alert" className="mt-2 text-lg font-semibold text-alert">
          {t('hulp.mislukt')}
        </p>
      ) : null}
    </div>
  )
}
