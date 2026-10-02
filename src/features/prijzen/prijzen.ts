import { supabase } from '../../lib/supabase'

export interface Plan {
  id: string
  product: 'home' | 'care'
  naam: string
  omschrijving: string | null
  eenheid: 'huishouden' | 'bewoner'
  prijs_maand_cent: number | null
  prijs_jaar_cent: number | null
  minimum_maand_cent: number | null
  btw_inbegrepen: boolean
  proefdagen: number
  onderdelen: string[]
  voorstel: boolean
}

/** null = migratie 77 nog niet gedraaid. */
export async function publiekePrijzen(): Promise<Plan[] | null> {
  const { data, error } = await supabase.rpc('publieke_prijzen')
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null
    throw error
  }
  return (data ?? []) as Plan[]
}

/** € 9,99 — of € 9 als er geen centen zijn. Altijd Belgische notatie. */
export function euro(cent: number): string {
  const heel = cent % 100 === 0
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: heel ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cent / 100)
}

/** Hoeveel je bespaart met een jaarabonnement, in maanden (afgerond). */
export function maandenGratis(p: Pick<Plan, 'prijs_maand_cent' | 'prijs_jaar_cent'>): number {
  if (!p.prijs_maand_cent || !p.prijs_jaar_cent) return 0
  return Math.max(0, Math.round((p.prijs_maand_cent * 12 - p.prijs_jaar_cent) / p.prijs_maand_cent))
}

/** Wat een WZC per maand zou betalen voor zoveel actieve bewoners. */
export function careRaming(p: Pick<Plan, 'prijs_maand_cent' | 'minimum_maand_cent'>, bewoners: number): number {
  const per = p.prijs_maand_cent ?? 0
  return Math.max(per * bewoners, p.minimum_maand_cent ?? 0)
}

export const STATUS: Record<string, string> = {
  trial: 'Proefperiode',
  pilot: 'Pilot',
  active: 'Actief',
  past_due: 'Betaling openstaand',
  paused: 'Gepauzeerd',
  cancelled: 'Stopgezet',
}

export interface MijnAbonnement {
  plan_id: string
  status: string
  trial_ends_at: string | null
  pilot_ends_at: string | null
}

/** Het abonnement van dit huishouden of deze organisatie; de database toont het alleen aan de beheerder. */
export async function mijnAbonnement(soort: 'household_id' | 'org_id', id: string): Promise<MijnAbonnement | null> {
  const { data, error } = await supabase
    .from('subscription')
    .select('plan_id, status, trial_ends_at, pilot_ends_at')
    .eq(soort, id)
    .not('status', 'eq', 'cancelled')
    .maybeSingle()
  if (error) return null
  return (data as MijnAbonnement | null) ?? null
}
