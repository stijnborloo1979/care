import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { vraagGesprek } from '../../services/calls'
import { t } from '../../lib/i18n'
import type { PersonCard } from '../../services/people'

/**
 * De knop waarmee de persoon iemand bereikt.
 *
 * Twee verschillende dingen achter één soort knop, en het verschil zit in
 * of die ander de app gebruikt:
 *
 *   - Wél (een familielid met een account): dan wordt het een vraag. Bellen
 *     gaat in deze app maar één kant op — familie belt, de tablet rinkelt
 *     en neemt op — dus zij vraagt of ze eens bellen, en familie krijgt
 *     meteen een melding. Dat werkt op een tablet zonder simkaart, wat een
 *     tel:-link niet doet.
 *   - Niet (de huisarts, de buurman): dan blijft het een gewone telefoonlink.
 *     Op een toestel dat kan bellen werkt dat; op een tablet niet, maar daar
 *     is de app ook niet de weg naar de huisarts.
 *
 * Na het vragen verandert de knop in een geruststelling en niet in een
 * vinkje: "Els weet het. Ze belt je zo terug." Dat is wat ze wil weten.
 */
export default function BelKnop({ p, householdId }: { p: PersonCard; householdId: string }) {
  const [gevraagd, setGevraagd] = useState(false)

  const vraag = useMutation({
    mutationFn: () => vraagGesprek(householdId),
    onSuccess: () => setGevraagd(true),
  })

  const stijl =
    'flex min-h-[5rem] w-full items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface px-5 text-left text-xl font-bold shadow-card'

  // Geen account: de gewone telefoonlink blijft de beste gok.
  if (!p.profile_id) {
    return (
      <a href={`tel:${(p.phone ?? '').replace(/\s/g, '')}`} className={stijl}>
        <span className="text-3xl" aria-hidden="true">
          📞
        </span>
        {t('hulp.bel', { naam: p.name })}
      </a>
    )
  }

  if (gevraagd) {
    return (
      <p
        aria-live="polite"
        className="flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-accent bg-accent-soft px-5 text-xl font-bold shadow-card"
      >
        <span className="text-3xl" aria-hidden="true">
          ✓
        </span>
        {t('hulp.gevraagd', { naam: p.name })}
      </p>
    )
  }

  return (
    <button onClick={() => vraag.mutate()} disabled={vraag.isPending} className={stijl}>
      <span className="text-3xl" aria-hidden="true">
        📞
      </span>
      <span className="min-w-0 flex-1">
        {vraag.isPending ? t('hulp.vraagBezig') : t('hulp.vraagBel', { naam: p.name })}
        {vraag.isError ? (
          <span role="alert" className="mt-1 block text-lg font-semibold text-alert">
            {t('hulp.vraagMislukt')}
          </span>
        ) : null}
      </span>
    </button>
  )
}
