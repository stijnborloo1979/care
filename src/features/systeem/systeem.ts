import { supabase } from '../../lib/supabase'

export interface Controle {
  migratie: number
  onderdeel: string
  aanwezig: boolean
}

/** null = migratie 76 zelf ontbreekt nog. */
export async function systeemControle(): Promise<Controle[] | null> {
  const { data, error } = await supabase.rpc('systeem_controle')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null
    throw error
  }
  return (data ?? []) as Controle[]
}

/** De ontbrekende migraties, oplopend: in die volgorde te draaien. */
export function ontbrekend(lijst: Controle[]): Controle[] {
  return lijst.filter((c) => !c.aanwezig).sort((a, b) => a.migratie - b.migratie)
}

export const bestand = (nr: number) => `${String(nr).padStart(2, '0')}_…sql`
