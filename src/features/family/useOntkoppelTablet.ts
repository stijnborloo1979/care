import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * De tablet ontkoppelen (migratie 110). Haalt het lidmaatschap 'person'
 * weg, koppelt de kaart "Dit ben jij" los en trekt de aanmelding in. Alle
 * toestellen die als de persoon aangemeld zijn, delen één account, dus die
 * gaan samen uit.
 */
export function useOntkoppelTablet(householdId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc('ontkoppel_tablet', { hh: householdId, profiel: profileId })
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['members', householdId] })
      queryClient.invalidateQueries({ queryKey: ['tablet', householdId] })
    },
  })
}
