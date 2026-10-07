import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from './usePeople'
import { t } from '../../lib/i18n'
import BelKnop from './BelKnop'
import HulpKnop from './HulpKnop'
import { huidigePrefs, magBellen } from '../settings/useDisplayPrefs'

/**
 * Wie er op het Help-scherm past.
 *
 * Apart van het scherm, zodat de regel te testen is: hij bepaalt wie iemand
 * in de war of ongerust te zien krijgt, en dat is te belangrijk om alleen
 * met de ogen na te kijken.
 */
export function kiesBereikbaar<T extends { kind: string; phone?: string | null; profile_id?: string | null }>(
  mensen: T[],
  kanBellen: boolean,
): T[] {
  const familie = mensen.filter((p) => p.kind === 'family')
  const anderen = kanBellen
    ? mensen.filter((p) => p.kind !== 'family' && p.kind !== 'self' && !!p.phone)
    : []
  return [...familie, ...anderen].slice(0, 3)
}

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

  // Hoogstens drie namen, en dus mogen het alleen namen zijn die iets
  // opleveren.
  //
  // Familie staat vooraan: die bereikt ze altijd, met of zonder
  // telefoonnummer, want bij hen wordt het een vraag om terug te bellen.
  // De huisarts of de verpleegster komen daarna, en alleen wanneer dit
  // toestel echt kan bellen — anders is hun kaart een nummer dat niets doet,
  // en dan neemt het een plaats in van iemand die wél te bereiken is. Ze
  // blijven gewoon zichtbaar bij "Wie is wie?", waar ze thuishoren.
  const bellen = kiesBereikbaar(people ?? [], bellenKan)

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
              {t('hulp.bel112')}
            </p>
            <p className="mt-2 text-lg">
              {prefs.noodplan.trim() || t('hulp.kanNietScherm')}
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
          : t('hulp.schermBeltNiet')}
      </p>
    </main>
  )
}
