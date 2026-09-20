import { useQuery } from '@tanstack/react-query'
import { getPhotos } from '../../services/memories'

export function usePhotos(householdId: string) {
  return useQuery({
    queryKey: ['photos', householdId],
    queryFn: () => getPhotos(householdId),
    staleTime: 5 * 60_000,
  })
}
