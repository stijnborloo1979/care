import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface DisplayPrefs {
  scale: '1' | '1.15' | '1.3' | '1.5'
  contrast: 'normal' | 'high'
  theme: 'auto' | 'light' | 'dark'
  /** Accentkleur. Vaste keuzes; de waarden staan in index.css. */
  accent: 'groenblauw' | 'blauw' | 'groen' | 'paars' | 'warm'
  simple: boolean
  voice: boolean
  /** Het scherm licht op bij een melding. */
  licht: boolean
  /** Het scherm blijft aan, voor een tablet die altijd in de lader staat. */
  schermAan: boolean
  /** Kioskmodus: geldt alleen op de gekoppelde tablet van de persoon. */
  kiosk: boolean
  /** Minuten zonder aanraking voor de kiosk terugkeert naar Vandaag. */
  kioskTerug: 2 | 5 | 10
  /** Nachtscherm van dit uur tot dat uur (0–23). Gelijk betekent: geen nachtscherm. */
  nachtVan: number
  nachtTot: number
}

export const STANDAARD: DisplayPrefs = {
  scale: '1',
  contrast: 'normal',
  theme: 'auto',
  accent: 'groenblauw',
  simple: false,
  voice: true,
  licht: true,
  schermAan: false,
  kiosk: false,
  kioskTerug: 5,
  nachtVan: 22,
  nachtTot: 7,
}

const LOKAAL = 'thuis.display'

/**
 * Lokaal bewaren zodat de tablet de juiste grootte meteen toont, ook voor
 * de eerste query binnen is. Niets kan zo storen als tekst die na een
 * seconde van formaat verspringt.
 */
export function huidigePrefs(): DisplayPrefs {
  return lees()
}

function lees(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(LOKAAL)
    return raw ? { ...STANDAARD, ...JSON.parse(raw) } : STANDAARD
  } catch {
    return STANDAARD
  }
}

function bewaarLokaal(p: DisplayPrefs) {
  try {
    localStorage.setItem(LOKAAL, JSON.stringify(p))
  } catch {
    // Opslag kan geweigerd zijn; de app werkt gewoon door.
  }
}

export function pasToe(p: DisplayPrefs) {
  const r = document.documentElement
  r.setAttribute('data-scale', p.simple && p.scale === '1' ? '1.15' : p.scale)
  r.setAttribute('data-contrast', p.contrast)
  if (p.accent === 'groenblauw') r.removeAttribute('data-accent')
  else r.setAttribute('data-accent', p.accent)
  if (p.theme === 'auto') r.removeAttribute('data-theme')
  else r.setAttribute('data-theme', p.theme)
  document.body.setAttribute('data-simple', p.simple ? 'true' : 'false')
}

/** Meteen bij het opstarten, nog voor React iets rendert. */
export function pasLokaalToe() {
  pasToe(lees())
}

export function useDisplayPrefs(householdId: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['prefs', householdId],
    enabled: !!householdId,
    staleTime: 60_000,
    queryFn: async (): Promise<DisplayPrefs> => {
      const { data, error } = await supabase
        .from('household')
        .select('display_prefs')
        .eq('id', householdId)
        .maybeSingle()
      if (error) throw error
      const rij = (data as { display_prefs: Partial<DisplayPrefs> } | null)?.display_prefs ?? {}
      return { ...STANDAARD, ...rij }
    },
  })

  useEffect(() => {
    if (query.data) {
      bewaarLokaal(query.data)
      pasToe(query.data)
    }
  }, [query.data])

  const zet = useMutation({
    mutationFn: async (deel: Partial<DisplayPrefs>) => {
      const nieuw = { ...(query.data ?? lees()), ...deel }
      bewaarLokaal(nieuw)
      pasToe(nieuw)
      const { error } = await supabase.rpc('set_display_prefs', {
        hh: householdId,
        prefs: deel,
      })
      if (error) throw error
      return nieuw
    },
    onSuccess: (nieuw) => queryClient.setQueryData(['prefs', householdId], nieuw),
  })

  return { prefs: query.data ?? lees(), zet }
}
