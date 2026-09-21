import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
 * Welk huishouden actief is, bewaard op het toestel. Wie voor twee ouders
 * zorgt, of een verpleegkundige met meerdere cliënten, wisselt zo zonder
 * opnieuw in te loggen.
 */
const useKeuze = create<{ gekozen: string | null; kies: (id: string) => void }>()(
  persist(
    (set) => ({
      gekozen: null,
      kies: (id) => set({ gekozen: id }),
    }),
    { name: 'thuis.huishouden' },
  ),
)

export function useHouseholds() {
  const { session } = useAuth()

  return useQuery({
    queryKey: ['households', session?.user.id],
    enabled: !!session,
    // Bij elke start opnieuw vragen. De lijst wordt ook in de browser
    // bewaard voor offline gebruik, en zonder dit bleef een gewist of
    // nieuw huishouden tot vijf minuten lang onzichtbaar. De vraag is
    // klein; de verwarring als het niet klopt is groot.
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<Household[]> => {
      const { data, error } = await supabase.rpc('my_households')
      if (error) throw error
      return (data ?? []) as Household[]
    },
  })
}

export function useHousehold() {
  const { data, isLoading, isFetching, isError } = useHouseholds()
  const { gekozen, kies } = useKeuze()

  const lijst = data ?? []
  const actief = lijst.find((h) => h.household_id === gekozen) ?? lijst[0] ?? null

  // Een lege lijst uit de cache is geen antwoord zolang er nog een nieuwe
  // onderweg is. Zonder dit stuurde de app je na de onboarding terug naar
  // /start: het huishouden bestond al, maar de oude, lege cache kwam eerst
  // binnen en de app besliste daarop.
  const bezig = isLoading || (isFetching && lijst.length === 0)

  return { household: actief, all: lijst, isLoading: bezig, isError, kies }
}
