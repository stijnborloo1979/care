import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../features/auth/AuthProvider'
import { toonNaam } from '../features/messages/messages'

/** De naam uit "Jouw naam" (Instellingen), of leeg. */
export async function mijnProfielNaam(id: string): Promise<string> {
  const { data, error } = await supabase.from('profile').select('full_name').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as { full_name: string | null } | null)?.full_name ?? ''
}

/**
 * Hoe we iemand aanspreken. Wat hij zelf bij "Jouw naam" zette, gaat voor;
 * anders een naam uit het e-mailadres ("stijn.borloo@…" → "Stijn Borloo"),
 * nooit het adres zelf.
 */
export function kiesNaam(profielNaam: string | null | undefined, email: string | null | undefined): string {
  const eigen = (profielNaam ?? '').trim()
  if (eigen && !eigen.includes('@')) return eigen
  return email ? toonNaam(email) : ''
}

export function useMijnNaam(): string {
  const { session } = useAuth()
  const id = session?.user.id ?? ''
  const { data } = useQuery({
    queryKey: ['mijn-profiel', id],
    enabled: !!id,
    queryFn: () => mijnProfielNaam(id),
  })
  return kiesNaam(data, session?.user.email)
}
