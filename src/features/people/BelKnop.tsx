import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
export default function BelKnop({
  p,
  householdId,
  kanBellen,
  alleen = false,
}: {
  p: PersonCard
  householdId: string
  /** Kan dit toestel echt telefoneren? Zo niet, dan wordt een nummer tekst. */
  kanBellen: boolean
  /**
   * Staat deze knop alleen op het scherm?
   *
   * Op het Help-scherm staan de andere familieleden er gewoon onder, dus daar
   * is een verwijzing overbodig. Op de kaart van één persoon niet: daar zat ze
   * na het vragen vast, en moest ze eerst terug — precies de weg die iemand
   * met geheugenproblemen niet vindt.
   */
  alleen?: boolean
}) {
  // Hoe vaak ze het op dit scherm gevraagd heeft. Nul betekent: nog niet.
  const [keer, setKeer] = useState(0)

  const vraag = useMutation({
    mutationFn: () => vraagGesprek(householdId, p.name),
    onSuccess: () => setKeer((n) => n + 1),
  })

  const stijl =
    'flex min-h-[5rem] w-full items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface px-5 text-left text-xl font-bold shadow-card'

  // Familie bereik je via de melding, of hun kaart nu aan een account
  // gekoppeld is of niet — die koppeling wordt in de praktijk bijna nooit
  // gelegd, en dat had tot gevolg dat hier toch weer een telefoonlink
  // stond. Voor de huisarts of de buurman blijft de telefoonlink kloppen:
  // die krijgen geen melding.
  if (p.kind !== 'family') {
    // Kan dit toestel niet bellen, dan is een telefoonlink een lege
    // belofte. Het nummer zelf is dan wél bruikbaar: iemand kan het
    // overtypen op een gewone telefoon.
    if (!kanBellen) {
      // Zonder uitleg is dit een kaart die eruitziet als een knop en niets
      // doet. Het nummer blijft staan — iemand kan het overtypen op een
      // gewone telefoon — maar er staat bij waaróm er niets gebeurt, en het
      // is geen knop meer.
      return (
        <div
          className={stijl
            .replace('items-center', 'flex-col items-start justify-center')
            .replace('border-line-strong', 'border-line')}
        >
          <span>{p.name}</span>
          <span className="text-lg font-semibold tabular-nums text-ink-soft">{p.phone}</span>
          <span className="text-base font-normal text-ink-faint">
            Bellen kan niet met dit scherm.
          </span>
        </div>
      )
    }

    return (
      <a href={`tel:${(p.phone ?? '').replace(/\s/g, '')}`} className={stijl}>
        <span className="text-3xl" aria-hidden="true">
          📞
        </span>
        {t('hulp.bel', { naam: p.name })}
      </a>
    )
  }

  if (keer > 0) {
    // De geruststelling blijft de hoofdzaak; daaronder een rustige knop om
    // het nog eens te vragen.
    //
    // Zonder die knop moest ze eerst weg van dit scherm en dan terug, en dat
    // is precies wat iemand met geheugenproblemen niet vindt. Wachten duurt
    // lang wanneer je niet zeker weet of het gelukt is, en dan is "nog eens
    // vragen" een redelijke wens — geen last. De database houdt het tempo
    // in de hand, niet dit scherm.
    return (
      <div className="rounded-card border-[1.5px] border-accent bg-accent-soft px-5 py-4 shadow-card">
        <p aria-live="polite" className="flex items-center gap-4 text-xl font-bold">
          <span className="text-3xl" aria-hidden="true">
            ✓
          </span>
          <span className="min-w-0">{t('hulp.gevraagd', { naam: p.name })}</span>
        </p>

        <button
          onClick={() => vraag.mutate()}
          disabled={vraag.isPending}
          className="mt-3 min-h-touch rounded-pill border-[1.5px] border-accent px-5 text-lg font-semibold disabled:opacity-60"
        >
          {vraag.isPending ? t('hulp.vraagBezig') : t('hulp.nogEens')}
        </button>

        {keer > 1 ? (
          <p aria-live="polite" className="mt-2 text-lg">
            {t('hulp.nogEensGedaan')}
          </p>
        ) : null}

        {vraag.isError ? (
          <p role="alert" className="mt-2 text-lg font-semibold text-alert">
            {t('hulp.vraagMislukt')}
          </p>
        ) : null}

        {alleen ? (
          <Link
            to="/help"
            className="mt-3 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong bg-surface px-5 text-lg font-semibold"
          >
            {t('hulp.iemandAnders')}
          </Link>
        ) : null}
      </div>
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
