import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export type Role = 'person' | 'admin' | 'member' | 'caregiver'

export type SupportLevel = 'zelf' | 'samen' | 'ondersteund'

export interface Household {
  household_id: string
  person_name: string
  timezone: string
  role: Role
  org_id: string | null
  /** Ben jij de persoon over wie dit huishouden gaat? Dat bepaalt het scherm. */
  is_self: boolean
  support_level: SupportLevel
  requested_support_level: SupportLevel | null
  share_quick_notes: boolean
  /**
   * Onder welk huishouden de Home Memory valt. Meestal hetzelfde als
   * household_id; anders staat de persoon bij iemand anders in huis en is
   * er één keuken voor twee mensen.
   *
   * Bewust een tweede veld en niet in de plaats van household_id: alles
   * wat van de persoon is — medicatie, agenda, herinneringen — blijft aan
   * household_id hangen. Eén veld voor beide zou betekenen dat één
   * vergeten plek medicatie van de verkeerde persoon oplevert.
   */
  home_id: string
  /** Wiens huis het is, als het niet het eigen huis is. */
  home_name: string | null
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
      // Zorg dat de sessie beschikbaar is en goed geladen voordat we de RPC aanroepen
      console.log('[DEBUG] Refreshing auth session...')
      await supabase.auth.refreshSession()
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      console.log('[DEBUG] Session after refresh:', currentSession?.user.id)

      if (!currentSession?.user.id) {
        console.error('[DEBUG] No user ID in session after refresh')
        throw new Error('Not authenticated - no user ID in session')
      }

      // CRITICAL FIX: Pass the user ID explicitly to the RPC instead of relying on auth.uid() context
      // auth.uid() can return NULL in some RPC contexts, causing empty results even though data exists
      console.log('[DEBUG] Calling my_households() RPC with explicit user_id:', currentSession.user.id)
      const { data, error } = await supabase.rpc('my_households', {
        user_id: currentSession.user.id
      })
      console.log('[DEBUG] my_households() returned:', data?.length, 'households', error ? `ERROR: ${error.message}` : 'OK')

      if (error) throw error
      // home_id komt uit migratie 45. Zolang die nog niet gedraaid is, is
      // het eigen huishouden het huis — dan werkt de app zoals voorheen in
      // plaats van met een leeg Home Memory te blijven staan.
      return ((data ?? []) as Household[]).map((h) => ({
        ...h,
        home_id: h.home_id ?? h.household_id,
        home_name: h.home_name ?? null,
      }))
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
