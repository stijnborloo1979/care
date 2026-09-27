import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Els past de planning aan terwijl de tablet van Maria openstaat: dat moet
 * doorkomen zonder dat iemand ververst.
 *
 * Bewust niet op alles: documenten en foto's veranderen zelden, en een
 * abonnement erop is ruis.
 */
export interface Abonnement {
  tabel: string
  /** De kolom waarop we filteren. Bijna overal household_id — behalve op de
   *  tabel household zelf, waar het huishouden zíjn eigen id is. Dat verschil
   *  stond er eerst niet in, en daarom kwam een gewijzigde instelling nooit
   *  op de tablet aan. */
  kolom?: string
  /** Querysleutels die dan opnieuw opgehaald moeten worden, met het
   *  huishouden erachter. */
  sleutels?: string[]
  /** Sleutels die op naam alleen ververst worden, zonder huishouden erachter.
   *  De lijst van huishoudens hangt aan de gebruiker, niet aan één huis. */
  losseSleutels?: string[]
}

export const ABONNEMENTEN: Abonnement[] = [
  { tabel: 'agenda_event', sleutels: ['agenda', 'summary', 'week'] },
  { tabel: 'medication_log', sleutels: ['summary', 'meds-today'] },
  { tabel: 'quick_note', sleutels: ['quicknotes'] },
  { tabel: 'life_story', sleutels: ['stories'] },
  { tabel: 'care_log', sleutels: ['carelog', 'summary'] },
  { tabel: 'message', sleutels: ['inbox'] },
  // Meldingen: de snelste weg die er is — binnen een seconde, gratis, zonder
  // toestemming. Werkt alleen zolang de app ergens open staat; daarvoor zijn
  // de andere wegen.
  { tabel: 'notification', sleutels: ['summary', 'push-status'] },
  // De instellingen en de indeling van het startscherm staan op de rij van
  // het huishouden zelf. Zonder dit abonnement moest de tablet wachten tot
  // een query vanzelf verouderde — en een tablet in een standaard verliest
  // nooit focus, dus in de praktijk gebeurde dat nooit.
  {
    tabel: 'household',
    kolom: 'id',
    sleutels: ['prefs', 'indeling'],
    losseSleutels: ['households'],
  },
]

export function useRealtime(householdId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!householdId) return

    const channel = supabase.channel(`hh:${householdId}`)

    ABONNEMENTEN.forEach(({ tabel, kolom, sleutels, losseSleutels }) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tabel,
          filter: `${kolom ?? 'household_id'}=eq.${householdId}`,
        },
        () => {
          sleutels?.forEach((s) =>
            queryClient.invalidateQueries({ queryKey: [s, householdId] }),
          )
          losseSleutels?.forEach((s) => queryClient.invalidateQueries({ queryKey: [s] }))
        },
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [householdId, queryClient])
}
