import { Navigate } from 'react-router-dom'
import { useHousehold } from './features/household/useHousehold'
import Today from './features/today/Today'

export default function PersonShell() {
  const { household, isLoading, isError } = useHousehold()

  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>

  if (isError) return <p className="p-6 text-ink-soft">De gegevens zijn nu niet te laden.</p>
  if (!household) return <Navigate to="/start" replace />

  return (
    <Today
      householdId={household.household_id}
      personName={household.person_name.split(' ')[0]}
      timezone={household.timezone}
    />
  )
}
