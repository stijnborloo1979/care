import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import MedicatieKaart from '../medication/MedicatieKaart'
import { useHousehold } from '../household/useHousehold'
import { tt } from '../../lib/uiTaal'
import { t } from '../../lib/i18n'

/** Het medicijnenscherm van de persoon: alleen de kaart, met een duidelijke terugweg. */
export default function MedicijnenNu() {
  const { household, isLoading } = useHousehold()

  if (isLoading || !household) return <p className="p-6 text-ink-soft">{t('algemeen.evenGeduld')}</p>

  return (
    <main className="mx-auto max-w-[44rem] space-y-6 px-5 pb-28 pt-6">
      <Link to="/" className="inline-flex min-h-touch items-center gap-2 text-xl font-semibold text-ink-soft">
        <Icon naam="terug" size={28} />
        {tt('Terug')}
      </Link>
      <h1 className="text-4xl font-extrabold tracking-tight">{tt('Mijn medicijnen')}</h1>
      <MedicatieKaart householdId={household.household_id} timezone={household.timezone} />
    </main>
  )
}
