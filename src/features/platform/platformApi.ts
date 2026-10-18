import { supabase } from '../../lib/supabase'

export type AanvraagStatus = 'ingediend' | 'gecontroleerd' | 'goedgekeurd' | 'afgewezen'

export interface Aanvraag {
  id: string
  naam: string
  ondernemingsnummer: string
  erkenningsnummer: string | null
  adres: string
  contact_naam: string
  contact_email: string
  telefoon: string
  status: AanvraagStatus
  aangevraagd_door: string
  telefoon_gecontroleerd_door: string | null
  besluit_door: string | null
  org_id: string | null
  notitie: string | null
  created_at: string
}

export interface ControleOrganisatie {
  id: string
  name: string
  contact_email: string | null
  created_at: string
  active: boolean
  beheerders: number
  huishoudens: number
}

export interface LogRegel {
  id: string
  soort: string
  org_id: string | null
  profile_id: string | null
  detail: Record<string, unknown>
  created_at: string
}

async function rpc<T>(naam: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(naam, args)
  if (error) throw error
  return data as T
}

export const isPlatformBeheerder = () => rpc<boolean>('is_platform_beheerder')
export const platformAanvragen = () => rpc<Aanvraag[]>('platform_aanvragen')
export const controleerAanvraag = (aanvraag: string, notitie: string) =>
  rpc<void>('controleer_org_aanvraag', { aanvraag, notitie: notitie.trim() || null })
export const keurAanvraagGoed = (aanvraag: string) => rpc<string>('keur_org_aanvraag_goed', { aanvraag })
export const wijsAanvraagAf = (aanvraag: string, reden: string) =>
  rpc<void>('wijs_org_aanvraag_af', { aanvraag, reden })
export const controleOrganisaties = () => rpc<ControleOrganisatie[]>('platform_organisaties_controle')
export const activeerOrganisatie = (org: string, dpa: string) => rpc<void>('activeer_organisatie', { org, dpa })
export const logLijst = (van = 50) => rpc<LogRegel[]>('platform_log_lijst', { van })

export async function ikId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
