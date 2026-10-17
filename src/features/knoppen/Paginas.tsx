import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { useHousehold } from '../household/useHousehold'
import OnthoudDit from '../memory/OnthoudDit'
import ZorgteamKaart from '../zorg/ZorgteamKaart'
import { tt } from '../../lib/uiTaal'
import { t } from '../../lib/i18n'

/** Een eigen pagina van de persoon, met altijd een terugweg naar het startscherm. */
function Pagina({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[44rem] space-y-6 px-5 pb-28 pt-6">
      <Link to="/" className="inline-flex min-h-touch items-center gap-2 text-xl font-semibold text-ink-soft">
        <Icon naam="terug" size={28} />
        {tt('Terug')}
      </Link>
      <h1 className="text-4xl font-extrabold tracking-tight">{titel}</h1>
      {children}
    </main>
  )
}

export function OnthoudenPagina() {
  const { household, isLoading } = useHousehold()
  if (isLoading || !household) return <p className="p-6 text-ink-soft">{t('algemeen.evenGeduld')}</p>
  return (
    <Pagina titel={tt('Iets onthouden')}>
      <OnthoudDit householdId={household.household_id} timezone={household.timezone} />
    </Pagina>
  )
}

export function ZorgteamPagina() {
  const { household, isLoading } = useHousehold()
  if (isLoading || !household) return <p className="p-6 text-ink-soft">{t('algemeen.evenGeduld')}</p>
  return (
    <Pagina titel={tt('Zorgteam')}>
      <ZorgteamKaart householdId={household.household_id} timezone={household.timezone} />
    </Pagina>
  )
}
