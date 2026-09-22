import { useQuery } from '@tanstack/react-query'
import { getNotes } from '../../services/notes'
import { getItems } from '../../services/homeMemory'
import { getPeople } from '../../services/people'
import { getQuickNotes } from '../../services/quickNotes'
import { getMedsToday } from '../../services/medsToday'
import { useRadio } from '../radio/radioStore'
import { useAgenda } from '../today/useAgenda'
import type { Kennis } from './answerEngine'

/** Alles wat de antwoordmotor mag gebruiken. Niets anders. */
export function useKennis(householdId: string, tz: string): { kennis: Kennis; isLoading: boolean } {
  const agenda = useAgenda(householdId, tz)

  const items = useQuery({
    queryKey: ['items', householdId],
    queryFn: () => getItems(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })

  const people = useQuery({
    queryKey: ['people', householdId],
    queryFn: () => getPeople(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })

  const notes = useQuery({
    queryKey: ['notes', householdId],
    queryFn: () => getNotes(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })

  const onthouden = useQuery({
    queryKey: ['quicknotes', householdId],
    queryFn: () => getQuickNotes(householdId),
    enabled: !!householdId,
    staleTime: 30_000,
  })

  // Kort houdbaar: "heb ik mijn pillen al genomen?" moet het antwoord van
  // nu krijgen, niet dat van vijf minuten geleden.
  const medicatie = useQuery({
    queryKey: ['meds-today', householdId],
    queryFn: () => getMedsToday(householdId, tz),
    enabled: !!householdId,
    staleTime: 15_000,
  })

  return {
    kennis: {
      events: agenda.data ?? [],
      items: items.data ?? [],
      people: people.data ?? [],
      notes: notes.data ?? [],
      onthouden: onthouden.data ?? [],
      medicatie: medicatie.data ?? [],
      zenders: useRadio.getState().lijst.map((z) => ({ id: z.id, name: z.name })),
      tz,
    },
    isLoading: agenda.isLoading || items.isLoading || people.isLoading || notes.isLoading,
  }
}
