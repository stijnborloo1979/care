import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { markDone } from '../services/agenda'
import { confirmMedication } from '../services/dashboard'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Een dag oude cache is beter dan een leeg scherm: de tablet in de
      // keuken heeft geregeld geen verbinding.
      gcTime: 24 * 60 * 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 2,
      // 'offlineFirst' zou meteen proberen en falen. Standaard pauzeert
      // een mutatie zonder verbinding, en dat is precies wat we willen:
      // ze wacht in de wachtrij tot de wifi terug is.
      networkMode: 'online',
    },
  },
})

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'thuis.cache',
  throttleTime: 1000,
})

/**
 * Mutaties die offline gestart worden, moeten na een herstart nog kunnen
 * doorgaan. Daarvoor moet hun functie op de client staan, niet in een
 * component: een gepauzeerde mutatie overleeft de pagina die haar startte.
 *
 * Dit is belangrijker dan het lijkt. Vinkt Maria het ontbijt af en gaat
 * dat verloren, dan ziet Els ten onrechte dat het niet gebeurd is en belt
 * ze voor niets.
 */
type AgendaRij = { id: string; done_at: string | null }
type MedRij = { id: string; taken_at: string | null }

queryClient.setMutationDefaults(['markDone'], {
  mutationFn: (v: { id: string; done: boolean; householdId: string }) => markDone(v.id, v.done),
  onMutate: async (v: { id: string; done: boolean; householdId: string }) => {
    await queryClient.cancelQueries({ queryKey: ['agenda', v.householdId] })
    const vorige = queryClient.getQueryData(['agenda', v.householdId])
    queryClient.setQueryData(['agenda', v.householdId], (oud: unknown) =>
      ((oud ?? []) as AgendaRij[]).map((e) =>
        e.id === v.id ? { ...e, done_at: v.done ? new Date().toISOString() : null } : e,
      ),
    )
    return { vorige }
  },
  onError: (_e, v, context) => {
    const c = context as { vorige?: unknown } | undefined
    if (c?.vorige) queryClient.setQueryData(['agenda', v.householdId], c.vorige)
  },
  onSettled: (_d, _e, v) => {
    queryClient.invalidateQueries({ queryKey: ['agenda', v.householdId] })
  },
})

queryClient.setMutationDefaults(['confirmMedication'], {
  mutationFn: (v: { id: string; taken: boolean; householdId: string }) =>
    confirmMedication(v.id, v.taken),
  onMutate: async (v: { id: string; taken: boolean; householdId: string }) => {
    await queryClient.cancelQueries({ queryKey: ['summary', v.householdId] })
    const vorige = queryClient.getQueryData(['summary', v.householdId])
    queryClient.setQueryData(['summary', v.householdId], (oud: unknown) => {
      const s = oud as { meds?: MedRij[] } | undefined
      if (!s?.meds) return oud
      return {
        ...s,
        meds: s.meds.map((m) =>
          m.id === v.id ? { ...m, taken_at: v.taken ? new Date().toISOString() : null } : m,
        ),
      }
    })
    return { vorige }
  },
  onError: (_e, v, context) => {
    const c = context as { vorige?: unknown } | undefined
    if (c?.vorige) queryClient.setQueryData(['summary', v.householdId], c.vorige)
  },
  onSettled: (_d, _e, v) => {
    queryClient.invalidateQueries({ queryKey: ['summary', v.householdId] })
  },
})
