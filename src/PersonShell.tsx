import { Navigate } from 'react-router-dom'
import { useHousehold } from './features/household/useHousehold'
import Today from './features/today/Today'
import KnoppenHome from './features/knoppen/KnoppenHome'
import KnoppenVandaag from './features/knoppen/KnoppenVandaag'
import { useDisplayPrefs } from './features/settings/useDisplayPrefs'
import { t } from './lib/i18n'

/**
 * Het overzicht zelf, altijd in de originele indeling. De tegel "Vandaag"
 * op het scherm met grote knoppen brengt hier naartoe; "/" zou opnieuw het
 * scherm met grote knoppen tonen en dan lijkt de knop niets te doen.
 */
export function Overzicht() {
  const { household, isLoading, isError } = useHousehold()
  // Vóór de vroegtijdige returns: de hook blijft in elke weergave dezelfde volgorde.
  const { prefs } = useDisplayPrefs(household?.household_id ?? '')

  if (isLoading) return <p className="p-6 text-ink-soft">{t('algemeen.evenGeduld')}</p>
  if (isError) return <p className="p-6 text-ink-soft">{t('algemeen.nietTeLaden')}</p>
  if (!household) return <Navigate to="/start" replace />

  const personName = household.person_name.split(' ')[0]
  // Grote knoppen: het eigen overzicht met grote tekst en één ding tegelijk.
  // Origineel: het gewone overzicht, ongewijzigd.
  if (prefs.indeling === 'knoppen') {
    return (
      <main className="mx-auto max-w-[44rem] px-5 pb-28 pt-6">
        <KnoppenVandaag householdId={household.household_id} personName={personName} timezone={household.timezone} />
      </main>
    )
  }

  return (
    <Today
      householdId={household.household_id}
      personName={personName}
      timezone={household.timezone}
    />
  )
}

export default function PersonShell() {
  const { household, isLoading, isError } = useHousehold()
  // Vóór de vroegtijdige returns: de indeling hoort bij het huishouden, en
  // de hook moet in elke weergave dezelfde volgorde aanroepen.
  const { prefs } = useDisplayPrefs(household?.household_id ?? '')

  if (isLoading) return <p className="p-6 text-ink-soft">{t('algemeen.evenGeduld')}</p>

  if (isError) return <p className="p-6 text-ink-soft">{t('algemeen.nietTeLaden')}</p>
  if (!household) return <Navigate to="/start" replace />

  // De originele indeling is de standaard; het scherm met grote knoppen is
  // er naast, en wordt alleen getoond als familie of het WZC dat koos.
  if (prefs.indeling === 'knoppen') {
    return (
      <KnoppenHome
        personName={household.person_name.split(' ')[0]}
        timezone={household.timezone}
        kleuren={prefs.knoppenKleuren}
        fotos={prefs.knoppenFotos}
      />
    )
  }

  return (
    <Today
      householdId={household.household_id}
      personName={household.person_name.split(' ')[0]}
      timezone={household.timezone}
    />
  )
}
