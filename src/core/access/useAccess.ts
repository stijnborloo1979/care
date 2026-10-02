import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

/**
 * Wat mag ik bij dit huishouden? Eén vraag aan de database (my_access,
 * migratie 49), die dezelfde regels gebruikt als de RLS-policies.
 *
 * Dit is gemak, geen beveiliging: de database weigert hoe dan ook wat niet
 * mag. De frontend gebruikt dit om knoppen en menu's niet te tonen die
 * toch niets zouden doen.
 *
 * Staat migratie 49 nog niet in de database, dan geeft de hook `bekend:
 * false` terug. Schermen vallen dan terug op hun oude rolcontrole, zodat
 * de app blijft werken tijdens de overgang.
 */
export interface Access {
  bekend: boolean
  relations: string[]
  permissions: string[]
  can: (permission: string) => boolean
}

const ONBEKEND: Access = { bekend: false, relations: [], permissions: [], can: () => false }

/** Wat in de cache staat: alleen gewone gegevens, geen functies. */
interface AccessData {
  bekend: boolean
  relations: string[]
  permissions: string[]
}

/**
 * De query-cache wordt in de browser bewaard (JSON). Een functie overleeft
 * dat niet: na herladen ontbrak `can`, en de app liep vast. Daarom bewaren
 * we alleen de lijsten en maken we `can` hier telkens opnieuw.
 */
export function maakAccess(d: Partial<AccessData> | null | undefined): Access {
  if (!d || !d.bekend) return ONBEKEND
  const permissions = Array.isArray(d.permissions) ? d.permissions : []
  const set = new Set(permissions)
  return {
    bekend: true,
    relations: Array.isArray(d.relations) ? d.relations : [],
    permissions,
    can: (p) => set.has(p),
  }
}

export function useAccess(householdId: string | null | undefined): Access & { isLoading: boolean } {
  const q = useQuery({
    queryKey: ['access', householdId],
    enabled: !!householdId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<AccessData> => {
      const { data, error } = await supabase.rpc('my_access', { hh: householdId })
      // PGRST202: de functie bestaat (nog) niet. Geen fout voor de gebruiker.
      if (error) return { bekend: false, relations: [], permissions: [] }
      const rij = (Array.isArray(data) ? data[0] : data) as
        | { relations: string[] | null; permissions: string[] | null }
        | null
      return { bekend: true, relations: rij?.relations ?? [], permissions: rij?.permissions ?? [] }
    },
  })
  const access = useMemo(() => maakAccess(q.data), [q.data])
  return { ...access, isLoading: q.isLoading }
}

/**
 * Mag ik dit? Volgens de database als die het weet (my_access), anders
 * volgens de oude rolcontrole die het scherm vroeger zelf deed (`terugval`).
 * Zo verandert er niets voor wie migratie 49 nog niet heeft.
 */
export function useMag(householdId: string | null | undefined, permissie: string, terugval: boolean): boolean {
  const a = useAccess(householdId)
  return mag(a, permissie, terugval)
}

export function mag(a: Pick<Access, 'bekend' | 'can'>, permissie: string, terugval: boolean): boolean {
  if (!a.bekend || typeof a.can !== 'function') return terugval
  return a.can(permissie)
}
