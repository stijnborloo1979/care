import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'

/**
 * Op het scherm van de persoon: een voorstel van familie om meer mee te
 * kijken. Het antwoord geeft de persoon zelf, op het scherm "Wie ziet wat".
 */
export default function SupportRequestBanner() {
  const { household } = useHousehold()
  if (!household?.is_self || !household.requested_support_level) return null

  return (
    <Link
      to="/delen"
      className="block rounded-card bg-accent-soft p-5 shadow-card ring-1 ring-accent/25"
    >
      <span className="block text-lg font-bold">Je familie stelt iets voor</span>
      <span className="mt-1 block text-ink-soft">
        Ze willen je wat meer helpen. Jij beslist. Tik om te bekijken.
      </span>
    </Link>
  )
}
