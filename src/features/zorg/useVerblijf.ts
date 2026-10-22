import { useQuery } from '@tanstack/react-query'
import { mijnWzc } from './zorgApi'

/**
 * Woont deze persoon nu in een woonzorgcentrum? De enige vraag die de app
 * daarover stelt, met het open verblijf als bron (109). Geeft de naam van
 * het WZC, de afdeling en de kamer, of null.
 *
 * Dezelfde sleutel als de koppelkaart bij familie: koppelen of ontkoppelen
 * ververst meteen elk scherm dat hiervan afhangt. Elke vijf minuten opnieuw,
 * want een tablet in een standaard keert nooit terug naar het scherm.
 */
export function useVerblijf(hh: string) {
  const q = useQuery({
    queryKey: ['wzc', hh],
    enabled: !!hh,
    queryFn: () => mijnWzc(hh),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
  return { verblijf: q.data ?? null, laden: q.isLoading }
}
