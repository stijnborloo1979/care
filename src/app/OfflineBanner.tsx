import { useEffect, useState } from 'react'
import { onlineManager, useMutationState } from '@tanstack/react-query'
import { tt } from '../lib/uiTaal'

/**
 * Eén regel bovenaan, alleen wanneer er iets aan de hand is. Familie moet
 * kunnen zien dat een afvinkbeurt nog onderweg is — anders lijkt het alsof
 * er niets gebeurd is.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(onlineManager.isOnline())
  const wachtend = useMutationState({
    filters: { status: 'pending' },
    select: (m) => m.state.status,
  }).length

  useEffect(() => onlineManager.subscribe(setOnline), [])

  if (online && wachtend === 0) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-50 border-b border-line bg-accent-soft px-4 py-2 text-center text-sm font-semibold text-accent-ink"
      style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
    >
      {!online
        ? wachtend > 0
          ? wachtend > 1
            ? tt('Geen verbinding — {n} wijzigingen wordt straks verstuurd', { n: wachtend })
            : tt('Geen verbinding — {n} wijziging wordt straks verstuurd', { n: wachtend })
          : tt('Geen verbinding — je ziet de laatst geladen gegevens')
        : wachtend > 1
          ? tt('{n} wijzigingen wordt verstuurd…', { n: wachtend })
          : tt('{n} wijziging wordt verstuurd…', { n: wachtend })}
    </div>
  )
}
