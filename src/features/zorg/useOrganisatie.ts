import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuth } from '../auth/AuthProvider'
import { mijnOrganisaties, type Organisatie } from './zorgApi'

/** Welke organisatie actief is, bewaard op het toestel (iemand kan in twee WZC's werken). */
const useKeuze = create<{ gekozen: string | null; kies: (id: string) => void }>()(
  persist(
    (set) => ({
      gekozen: null,
      kies: (id) => set({ gekozen: id }),
    }),
    { name: 'thuis.organisatie' },
  ),
)

export function useOrganisaties() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['organisaties', session?.user.id],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: mijnOrganisaties,
  })
}

export interface OrgContext {
  org: Organisatie | null
  alle: Organisatie[]
  isLoading: boolean
  kies: (id: string) => void
  /** Beheerder of coördinator: beheert toewijzingen, verblijf en activiteiten. */
  beheert: boolean
  /** Alleen de beheerder: medewerkers, afdelingen, koppelcode. */
  isBeheerder: boolean
}

export function useOrganisatie(): OrgContext {
  const { data, isLoading } = useOrganisaties()
  const { gekozen, kies } = useKeuze()
  const alle = data ?? []
  const org = alle.find((o) => o.org_id === gekozen) ?? alle[0] ?? null
  return {
    org,
    alle,
    isLoading,
    kies,
    beheert: !!org && (org.rol === 'org_admin' || org.rol === 'coordinator'),
    isBeheerder: org?.rol === 'org_admin',
  }
}
