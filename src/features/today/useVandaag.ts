import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAgenda } from './useAgenda'
import { dagVanBewoner, huisNaarAgenda, samenVoegen } from '../../services/afdelingsdag'
import { localDateKey } from '../../lib/time'
import { uitstappen, uitstapNaarAgenda } from '../../services/uitstap'

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
  // Uitstap met de familie (80): "Uitstap met Els" op het uur van vertrek.
  const uit = useQuery({
    queryKey: ['uitstappen', householdId],
    queryFn: () => uitstappen(householdId),
    enabled: !!householdId,
    staleTime: 60_000,
    // Kort: "Je bent op uitstap" moet snel weg zijn als ze terug is.
    refetchInterval: 2 * 60_000,
    retry: false,
  })
  const minuut = Math.floor(nu.getTime() / 60_000)
  const data = useMemo(
    () =>
      agenda.data
        ? samenVoegen(agenda.data, [
            ...huisNaarAgenda(huis.data ?? [], householdId, nu),
            ...uitstapNaarAgenda(uit.data ?? [], householdId, nu, tz),
          ])
        : undefined,
    // nu verandert per minuut; minuut is genoeg
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agenda.data, huis.data, uit.data, householdId, tz, minuut],
  )
  return { data, isLoading: agenda.isLoading, isError: agenda.isError }
}
