import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Els past de planning aan terwijl de tablet van Maria openstaat: dat moet
 * doorkomen zonder dat iemand ververst.
 *
 * Bewust alleen op agenda, medicatie, logboek en berichten. Documenten en
 * foto's veranderen zelden, en een abonnement erop is ruis.
 */
const TABELLEN: { tabel: string; sleutels: string[] }[] = [
  { tabel: 'agenda_event', sleutels: ['agenda', 'summary'] },
  { tabel: 'medication_log', sleutels: ['summary'] },
  { tabel: 'care_log', sleutels: ['carelog', 'summary'] },
  { tabel: 'message', sleutels: ['inbox'] },
]

export function useRealtime(householdId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!householdId) return

    const channel = supabase.channel(`hh:${householdId}`)

    TABELLEN.forEach(({ tabel, sleutels }) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tabel,
          filter: `household_id=eq.${householdId}`,
        },
        () => {
          sleutels.forEach((s) =>
            queryClient.invalidateQueries({ queryKey: [s, householdId] }),
          )
        },
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [householdId, queryClient])
}
