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
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Household[]> => {
      const { data, error } = await supabase.rpc('my_households')
      if (error) throw error
      return (data ?? []) as Household[]
    },
  })
}

export function useHousehold() {
  const { data, isLoading, isError } = useHouseholds()
  const { gekozen, kies } = useKeuze()

  const lijst = data ?? []
  const actief = lijst.find((h) => h.household_id === gekozen) ?? lijst[0] ?? null

  return { household: actief, all: lijst, isLoading, isError, kies }
}
