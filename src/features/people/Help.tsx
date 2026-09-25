import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from './usePeople'
import { t } from '../../lib/i18n'
import BelKnop from './BelKnop'

/**
 * Eén scherm, grote knoppen, geen keuzes die uitleg nodig hebben.
 * Wie hier terechtkomt, is in de war of ongerust.
 */
export default function Help() {
  const { household } = useHousehold()
  const { data: people } = usePeople(household?.household_id ?? '')

  // Ook zonder telefoonnummer bereikbaar, zolang het familielid de app
  // gebruikt: dan wordt het een vraag om terug te bellen.
  const bellen = (people ?? [])
    .filter((p) => (p.phone || p.profile_id) && p.kind !== 'self')
    .slice(0, 3)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ {t('nav.vandaag')}
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{t('hulp.titel')}</h1>
      <p className="mt-1 text-lg text-ink-soft">{t('hulp.kies')}</p>

      <div className="mt-6 space-y-3">
        {bellen.map((p) => (
          <BelKnop key={p.id} p={p} householdId={household?.household_id ?? ''} />
        ))}

        <div className="rounded-card border-[1.5px] border-line-strong bg-surface p-5">
          <p className="text-xl font-bold">{t('hulp.waarBenIk')}</p>
          <p className="mt-1 text-lg text-ink-soft">{t('hulp.jeBentThuis')}</p>
        </div>

        <a
          href="tel:112"
          className="flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-alert bg-surface px-5 text-xl font-bold text-alert shadow-card"
        >
          <span className="text-3xl" aria-hidden="true">
            🚑
          </span>
          {t('hulp.noodnummer')}
        </a>
      </div>

      <p className="mt-5 text-center text-sm text-ink-faint">
        {t('hulp.noodUitleg')}
      </p>
    </main>
  )
}
