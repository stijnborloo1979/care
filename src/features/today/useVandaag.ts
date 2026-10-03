import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAgenda } from './useAgenda'
import { dagVanBewoner, huisNaarAgenda, samenVoegen } from '../../services/afdelingsdag'
import { localDateKey } from '../../lib/time'

/** De dag van de afdeling (78). Thuis: leeg. */
export function useDagVanHuis(householdId: string, tz: string) {
  // De dag zit in de sleutel: na middernacht meteen de nieuwe dag, niet
  // tien minuten lang die van gisteren.
  const dag = localDateKey(new Date(), tz)
  return useQuery({
    queryKey: ['dag-van-huis', householdId, dag],
    queryFn: () => dagVanBewoner(householdId, dag),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
    // Een tablet in een standaard krijgt geen focus: zo komt een nieuwe
    // activiteit toch op het scherm.
    refetchInterval: 10 * 60_000,
    retry: false,
  })
}

/**
 * De eigen agenda plus de dag van het woonzorgcentrum. De agenda blijft de
 * bron: lukt het ophalen van de afdeling niet, dan is de dag gewoon die van
 * vroeger.
 */
export function useVandaag(householdId: string, tz: string, nu: Date) {
  const agenda = useAgenda(householdId, tz)
  const huis = useDagVanHuis(householdId, tz)
  const minuut = Math.floor(nu.getTime() / 60_000)
  const data = useMemo(
    () => (agenda.data ? samenVoegen(agenda.data, huisNaarAgenda(huis.data ?? [], householdId, nu)) : undefined),
    // nu verandert per minuut; minuut is genoeg
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agenda.data, huis.data, householdId, minuut],
  )
  return { data, isLoading: agenda.isLoading, isError: agenda.isError }
}
