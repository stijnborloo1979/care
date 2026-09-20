import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export type Role = 'person' | 'admin' | 'member' | 'caregiver'

export interface Household {
  household_id: string
  person_name: string
  timezone: string
  role: Role
  org_id: string | null
}

/**
 * Het eerste wat de app na het inloggen opvraagt. De rol bepaalt welk
 * scherm iemand krijgt: 'person' gaat nooit naar het familiescherm.
 */
export function useHouseholds() {
  const { session } = useAuth()

  return useQuery({
    queryKey: ['households', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Household[]> => {
      const { data, error } = await supabase.rpc('my_households')
      if (error) throw error
      return (data ?? []) as Household[]
    },
  })
}

/** Het actieve huishouden. Bij meerdere cliënten kiest een keuzescherm. */
export function useHousehold() {
  const { data, isLoading, isError } = useHouseholds()
  const actief = data && data.length > 0 ? data[0] : null
  return { household: actief, all: data ?? [], isLoading, isError }
}
