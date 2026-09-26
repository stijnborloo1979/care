import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from './usePeople'
import { t } from '../../lib/i18n'
import BelKnop from './BelKnop'
import HulpKnop from './HulpKnop'
import { huidigePrefs, magBellen } from '../settings/useDisplayPrefs'

/**
 * Eén scherm, grote knoppen, geen keuzes die uitleg nodig hebben.
 * Wie hier terechtkomt, is in de war of ongerust.
 */
export default function Help() {
  const { household } = useHousehold()
  const { data: people } = usePeople(household?.household_id ?? '')
  const prefs = huidigePrefs()
  // Eén instelling, maar ze beslist per toestel: 'alleen op een telefoon'
  // betekent hier ja en op de tablet in de living nee.
  const bellenKan = magBellen(prefs)
  const hh = household?.household_id ?? ''

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
          <BelKnop key={p.id} p={p} householdId={hh} kanBellen={bellenKan} />
        ))}

        <div className="rounded-card border-[1.5px] border-line-strong bg-surface p-5">
          <p className="text-xl font-bold">{t('hulp.waarBenIk')}</p>
          <p className="mt-1 text-lg text-ink-soft">{t('hulp.jeBentThuis')}</p>
        </div>

        {/* Een toestel dat niet kan bellen, mag geen knop "112" tonen.
            Iemand drukt daarop in een echte noodsituatie en wacht op hulp
            die niet komt. Dan liever zeggen wat ze wél moet doen. */}
        {bellenKan ? (
          <a
            href="tel:112"
            className="flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-alert bg-surface px-5 text-xl font-bold text-alert shadow-card"
          >
            <span className="text-3xl" aria-hidden="true">
              🚑
            </span>
            {t('hulp.noodnummer')}
          </a>
        ) : (
          <div className="rounded-card border-[1.5px] border-alert bg-surface p-5 shadow-card">
            <p className="flex items-center gap-4 text-xl font-bold text-alert">
              <span className="text-3xl" aria-hidden="true">
                🚑
              </span>
              Bij dringende hulp: bel 112
            </p>
            <p className="mt-2 text-lg">
              {prefs.noodplan.trim() || 'Dat kan niet met dit scherm. Gebruik een telefoon.'}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <HulpKnop householdId={hh} />
      </div>

      <p className="mt-5 text-center text-sm text-ink-faint">
        {bellenKan
          ? t('hulp.noodUitleg')
          : 'Dit scherm kan niet bellen. Bij brand, gevaar of dringende medische hulp is 112 nodig, met een telefoon.'}
      </p>
    </main>
  )
}
