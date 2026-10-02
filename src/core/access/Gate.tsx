import type { ReactNode } from 'react'
import { useAccess } from './useAccess'

/**
 * Toont de inhoud alleen met de juiste permissie. Voor losse knoppen; een
 * heel scherm hoort via de navigatie of de router afgeschermd te worden.
 *
 * `fallback` bepaalt wat er gebeurt zolang de toegang niet bekend is
 * (migratie 49 nog niet gedraaid): standaard de inhoud tonen, zoals vóór
 * deze hook bestond. De database blijft toch de poortwachter.
 */
export function Gate({
  householdId,
  perm,
  children,
  zonderGegevens = 'tonen',
}: {
  householdId: string
  perm: string
  children: ReactNode
  zonderGegevens?: 'tonen' | 'verbergen'
}) {
  const a = useAccess(householdId)
  if (!a.bekend) return zonderGegevens === 'tonen' ? <>{children}</> : null
  return a.can(perm) ? <>{children}</> : null
}
