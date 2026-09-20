import { useQuery } from '@tanstack/react-query'
import { getPeople } from '../../services/people'

export function usePeople(householdId: string) {
  return useQuery({
    queryKey: ['people', householdId],
    queryFn: () => getPeople(householdId),
    staleTime: 5 * 60_000,
  })
}
