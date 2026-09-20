import { useQuery } from '@tanstack/react-query'
import { getNotes } from '../../services/notes'

export function useNotes(householdId: string) {
  return useQuery({
    queryKey: ['notes', householdId],
    queryFn: () => getNotes(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })
}
