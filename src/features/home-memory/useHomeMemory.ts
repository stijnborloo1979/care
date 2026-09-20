import { useQuery } from '@tanstack/react-query'
import { getItem, getItems, getRooms } from '../../services/homeMemory'

export function useRooms(householdId: string) {
  return useQuery({
    queryKey: ['rooms', householdId],
    queryFn: () => getRooms(householdId),
    staleTime: 5 * 60_000,
  })
}

export function useItems(householdId: string) {
  return useQuery({
    queryKey: ['items', householdId],
    queryFn: () => getItems(householdId),
    staleTime: 60_000,
  })
}

export function useItem(itemId: string) {
  return useQuery({
    queryKey: ['item', itemId],
    queryFn: () => getItem(itemId),
    enabled: !!itemId,
  })
}
