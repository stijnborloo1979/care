import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getZenders } from '../../services/radio'
import { useRadio } from './radioStore'

/** Haalt de zenders op en geeft ze door aan de speler, zodat stem en routines ze kennen. */
export function useZenders(householdId: string) {
  const zetLijst = useRadio((s) => s.zetLijst)
  const query = useQuery({
    queryKey: ['radio', householdId],
    queryFn: () => getZenders(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (query.data) zetLijst(query.data)
  }, [query.data, zetLijst])
  return query
}
