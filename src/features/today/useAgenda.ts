import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getToday } from '../../services/agenda'

/** Elke minuut een nieuwe klok, zodat "nu" vanzelf meeschuift. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function useAgenda(householdId: string, tz: string) {
  return useQuery({
    queryKey: ['agenda', householdId],
    queryFn: () => getToday(householdId, tz),
    staleTime: 60_000,
  })
}

/**
 * De mutatiefunctie en de optimistic update staan op de queryClient, niet
 * hier: zo overleeft een offline afvinkbeurt het sluiten van de app.
 */
export function useMarkDone(householdId: string) {
  const mutation = useMutation<unknown, Error, { id: string; done: boolean; householdId: string }>({
    mutationKey: ['markDone'],
  })
  return {
    ...mutation,
    mutate: (v: { id: string; done: boolean }) => mutation.mutate({ ...v, householdId }),
  }
}
