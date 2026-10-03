import { supabase } from '../../lib/supabase'
import { ontbrekendeFunctie } from '../../lib/ontbrekendeFunctie'

/**
 * Alles wat de schermen voor een woonzorgcentrum aan de database vragen.
 * Migraties 52 tot 60. Ontbreekt een functie (migratie niet gedraaid),
 * dan is er gewoon niets te tonen, geen foutmelding.
 */

export type OrgRol = 'org_admin' | 'coordinator' | 'caregiver'

export interface Afdeling {
  id: string
  naam: string
  rol?: 'team_lead' | 'staff'
}

export interface Organisatie {
  org_id: string
  naam: string
  rol: OrgRol
  team_lead: boolean
  afdelingen: Afdeling[]
}

export interface Bewoner {
  household_id: string
  naam: string
  afdeling: string | null
  kamer: string | null
  /** Alleen bij mijn_bewoners: hoe ik toegang heb. */
  via?: 'toegewezen' | 'afdeling'
  sinds?: string
}

export interface Medewerker {
  profile_id: string
  naam: string
  email: string | null
  rol: OrgRol
  actief: boolean
  afdelingen: (Afdeling & { rij: string })[]
}

export interface Zorgnotitie {
  id: string
  household_id: string
  category: Categorie
  body: string
  visibility: 'team' | 'familie'
  vervangt: string | null
  author_id: string | null
  created_at: string
}

export type Categorie = 'observatie' | 'zorg' | 'maaltijd' | 'slaap' | 'stemming' | 'incident' | 'overig'

export const CATEGORIEEN: { waarde: Categorie; label: string }[] = [
  { waarde: 'observatie', label: 'Observatie' },
  { waarde: 'zorg', label: 'Zorg' },
  { waarde: 'maaltijd', label: 'Maaltijd' },
  { waarde: 'slaap', label: 'Slaap' },
  { waarde: 'stemming', label: 'Stemming' },
  { waarde: 'incident', label: 'Incident' },
  { waarde: 'overig', label: 'Overig' },
]

export type Dienst = 'vroeg' | 'laat' | 'nacht'
export const DIENSTEN: { waarde: Dienst; label: string }[] = [
  { waarde: 'vroeg', label: 'Vroege dienst' },
  { waarde: 'laat', label: 'Late dienst' },
  { waarde: 'nacht', label: 'Nachtdienst' },
]

export interface Overdracht {
  id: string
  department_id: string
  shift_date: string
  shift: Dienst
  body: string
  author_id: string | null
  created_at: string
}

export interface Activiteit {
  id: string
  org_id: string
  department_id: string | null
  titel: string
  starts_at: string
  ends_at: string | null
  plaats: string | null
  status: 'gepland' | 'geannuleerd' | 'afgelopen'
}

export interface Deelname {
  activity_id: string
  household_id: string
  status: 'ingeschreven' | 'aanwezig' | 'afwezig'
}

async function rpcLijst<T>(naam: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(naam, args)
  if (error) {
    if (ontbrekendeFunctie(error)) return []
    throw error
  }
  return (data ?? []) as T[]
}

// ---- Organisatie ------------------------------------------------------

export const mijnOrganisaties = () => rpcLijst<Organisatie>('mijn_organisaties')

export async function maakOrganisatie(naam: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_organisation', { org_name: naam.trim() })
  if (error) throw error
  return data as string
}

export async function koppelcode(org: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('org_koppelcode', { org })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return (data as string | null) ?? null
}

export async function nieuweKoppelcode(org: string): Promise<string> {
  const { data, error } = await supabase.rpc('nieuwe_koppelcode', { org })
  if (error) throw error
  return data as string
}

// ---- Bewoners ---------------------------------------------------------

export const mijnBewoners = (org: string) => rpcLijst<Bewoner>('mijn_bewoners', { org })

export async function alleBewoners(org: string): Promise<Bewoner[]> {
  const rijen = await rpcLijst<{ household_id: string; person_name: string; afdeling: string | null; room: string | null; sinds: string }>(
    'org_bewoners',
    { org },
  )
  return rijen.map((r) => ({
    household_id: r.household_id,
    naam: r.person_name,
    afdeling: r.afdeling,
    kamer: r.room,
    sinds: r.sinds,
  }))
}

export async function bewonerNaam(hh: string): Promise<string | null> {
  const { data } = await supabase.from('household').select('person_name').eq('id', hh).maybeSingle()
  return (data?.person_name as string | undefined) ?? null
}

export async function agendaVandaag(hh: string) {
  const begin = new Date()
  begin.setHours(0, 0, 0, 0)
  const eind = new Date(begin)
  eind.setDate(eind.getDate() + 1)
  const { data, error } = await supabase
    .from('agenda_event')
    .select('id, starts_at, title, emoji, kind, done_at')
    .eq('household_id', hh)
    .gte('starts_at', begin.toISOString())
    .lt('starts_at', eind.toISOString())
    .order('starts_at')
  if (error) throw error
  return (data ?? []) as { id: string; starts_at: string; title: string; emoji: string | null; kind: string; done_at: string | null }[]
}

export async function contacten(hh: string) {
  const { data, error } = await supabase
    .from('person_card')
    .select('id, name, relation, phone, kind')
    .eq('household_id', hh)
    .in('kind', ['family', 'contact', 'care'])
    .order('sort')
  if (error) throw error
  return (data ?? []) as { id: string; name: string; relation: string; phone: string | null; kind: string }[]
}

// ---- Zorgnotities -----------------------------------------------------

export async function zorgnotities(hh: string): Promise<Zorgnotitie[]> {
  const { data, error } = await supabase
    .from('care_note')
    .select('id, household_id, category, body, visibility, vervangt, author_id, created_at')
    .eq('household_id', hh)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (ontbrekendeFunctie(error) || error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (data ?? []) as Zorgnotitie[]
}

export async function nieuweZorgnotitie(p: {
  household_id: string
  category: Categorie
  body: string
  visibility: 'team' | 'familie'
  vervangt?: string | null
}) {
  const { error } = await supabase.from('care_note').insert({
    household_id: p.household_id,
    category: p.category,
    body: p.body.trim(),
    visibility: p.visibility,
    vervangt: p.vervangt ?? null,
  })
  if (error) throw error
}

// ---- Overdracht -------------------------------------------------------

export async function overdrachten(afdeling: string, dagen = 3): Promise<Overdracht[]> {
  const sinds = new Date()
  sinds.setDate(sinds.getDate() - dagen)
  const { data, error } = await supabase
    .from('handover')
    .select('id, department_id, shift_date, shift, body, author_id, created_at')
    .eq('department_id', afdeling)
    .gte('shift_date', sinds.toISOString().slice(0, 10))
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Overdracht[]
}

export async function nieuweOverdracht(p: { department_id: string; shift_date: string; shift: Dienst; body: string; author_id: string }) {
  const { error } = await supabase.from('handover').insert({ ...p, body: p.body.trim() })
  if (error) throw error
}

/** Welke dienst is het nu? 7–15 vroeg, 15–22 laat, anders nacht. */
export function huidigeDienst(nu = new Date()): Dienst {
  const u = nu.getHours()
  if (u >= 7 && u < 15) return 'vroeg'
  if (u >= 15 && u < 22) return 'laat'
  return 'nacht'
}

/** De datum van de dienst: een nacht na middernacht hoort bij de vorige dag. */
export function dienstDatum(nu = new Date()): string {
  const d = new Date(nu)
  if (d.getHours() < 7) d.setDate(d.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---- Activiteiten -----------------------------------------------------

export async function activiteiten(org: string): Promise<Activiteit[]> {
  const sinds = new Date()
  sinds.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('activity')
    .select('id, org_id, department_id, titel, starts_at, ends_at, plaats, status')
    .eq('org_id', org)
    .gte('starts_at', sinds.toISOString())
    .order('starts_at')
    .limit(100)
  if (error) throw error
  return (data ?? []) as Activiteit[]
}

export async function nieuweActiviteit(p: { org_id: string; department_id: string | null; titel: string; starts_at: string; plaats: string | null }) {
  const { error } = await supabase.from('activity').insert({ ...p, titel: p.titel.trim() })
  if (error) throw error
}

export async function annuleerActiviteit(id: string) {
  const { error } = await supabase.from('activity').update({ status: 'geannuleerd' }).eq('id', id)
  if (error) throw error
}

export async function deelnames(activiteit: string): Promise<Deelname[]> {
  const { data, error } = await supabase
    .from('activity_participant')
    .select('activity_id, household_id, status')
    .eq('activity_id', activiteit)
  if (error) throw error
  return (data ?? []) as Deelname[]
}

export async function schrijfIn(activiteit: string, hh: string, status: Deelname['status'] = 'ingeschreven') {
  const { error } = await supabase.from('activity_participant').insert({ activity_id: activiteit, household_id: hh, status })
  if (error) throw error
}

export async function zetAanwezigheid(activiteit: string, hh: string, status: Deelname['status']) {
  const { error } = await supabase
    .from('activity_participant')
    .update({ status })
    .eq('activity_id', activiteit)
    .eq('household_id', hh)
  if (error) throw error
}

// ---- Noodtoegang ------------------------------------------------------

export interface NoodInzage {
  noodtoegang: { id: string; tot: string }
  bewoner: { naam: string; tijdzone: string }
  voorkeuren: { titel: string; tekst: string }[]
  agenda: { om: string; titel: string; soort: string; gedaan: boolean }[]
  logboek: { om: string; titel: string; notitie: string | null }[]
  zorgnotities?: { om: string; soort: string; tekst: string }[]
  contacten: { naam: string; relatie: string; telefoon: string | null }[]
}

export async function startNoodtoegang(hh: string, reden: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_noodtoegang', { hh, reden })
  if (error) throw error
  return data as string
}

export async function noodInzage(id: string): Promise<NoodInzage> {
  const { data, error } = await supabase.rpc('nood_inzage', { a_id: id })
  if (error) throw error
  return data as NoodInzage
}

export async function mijnLopendeNoodtoegang(hh: string, ik: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('emergency_access')
    .select('id, expires_at, ended_at')
    .eq('household_id', hh)
    .eq('profile_id', ik)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
  if (error) return null
  return (data?.[0]?.id as string | undefined) ?? null
}

export async function stopNoodtoegang(id: string) {
  const { error } = await supabase.rpc('stop_noodtoegang', { a_id: id })
  if (error) throw error
}

export async function noodtoegangenVanOrg(org: string) {
  const { data, error } = await supabase
    .from('emergency_access')
    .select('id, household_id, profile_id, reason, started_at, expires_at, ended_at')
    .eq('org_id', org)
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) return []
  return (data ?? []) as {
    id: string
    household_id: string
    profile_id: string
    reason: string
    started_at: string
    expires_at: string
    ended_at: string | null
  }[]
}

// ---- Beheer -----------------------------------------------------------

export const medewerkers = (org: string) => rpcLijst<Medewerker>('org_medewerkers', { org })

export interface AfdelingRij {
  id: string
  name: string
  archived_at: string | null
}

/** Alle afdelingen, ook gearchiveerde (72). Zonder 72: geen archief, zoals voorheen. */
export async function alleAfdelingen(org: string): Promise<AfdelingRij[]> {
  const met = await supabase.from('department').select('id, name, archived_at').eq('org_id', org).order('name')
  if (!met.error) return (met.data ?? []) as AfdelingRij[]
  const zonder = await supabase.from('department').select('id, name').eq('org_id', org).order('name')
  if (zonder.error) return []
  return ((zonder.data ?? []) as { id: string; name: string }[]).map((a) => ({ ...a, archived_at: null }))
}

/** De afdelingen waar iemand kan verblijven of werken: niet gearchiveerd. */
export async function afdelingen(org: string): Promise<{ id: string; name: string }[]> {
  return (await alleAfdelingen(org)).filter((a) => !a.archived_at).map(({ id, name }) => ({ id, name }))
}

export async function hernoemAfdeling(id: string, naam: string): Promise<void> {
  const { data, error } = await supabase.from('department').update({ name: naam.trim() }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder kan een afdeling hernoemen.')
}

export async function archiveerAfdeling(id: string): Promise<void> {
  const { error } = await supabase.rpc('archiveer_afdeling', { afdeling: id })
  if (error) throw error
}

export async function herstelAfdeling(id: string): Promise<void> {
  const { error } = await supabase.rpc('herstel_afdeling', { afdeling: id })
  if (error) throw error
}

// ---- Organisatie (65: alleen deze kolommen) --------------------------

export interface OrgGegevens {
  name: string
  contact_email: string | null
  vat_number: string | null
}

export async function orgGegevens(org: string): Promise<OrgGegevens | null> {
  const { data, error } = await supabase.from('organisation').select('name, contact_email, vat_number').eq('id', org).maybeSingle()
  if (error) return null
  return data as OrgGegevens | null
}

export async function zetOrgGegevens(org: string, g: OrgGegevens): Promise<void> {
  const { data, error } = await supabase
    .from('organisation')
    .update({ name: g.name.trim(), contact_email: g.contact_email?.trim() || null, vat_number: g.vat_number?.trim() || null })
    .eq('id', org)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder kan de gegevens aanpassen.')
}

export async function nieuweAfdeling(org: string, naam: string) {
  const { error } = await supabase.from('department').insert({ org_id: org, name: naam.trim() })
  if (error) throw error
}

export async function zetOpAfdeling(afdeling: string, profiel: string, rol: 'team_lead' | 'staff') {
  const { error } = await supabase.from('department_staff').insert({ department_id: afdeling, profile_id: profiel, role: rol })
  if (error) throw error
}

export async function haalVanAfdeling(rij: string) {
  const { error } = await supabase
    .from('department_staff')
    .update({ valid_until: new Date().toISOString() })
    .eq('id', rij)
  if (error) throw error
}

export async function nodigUit(org: string, email: string, rol: OrgRol): Promise<{ link: string; gemaild: boolean }> {
  const { data, error } = await supabase.rpc('nodig_medewerker_uit', { org, adres: email.trim(), rol })
  if (error) throw error
  const rij = (Array.isArray(data) ? data[0] : data) as { id: string; token: string }
  const link = `${window.location.origin}/zorg/uitnodiging?token=${rij.token}`
  // De mail mag mislukken (geen mailsleutel ingesteld): de link staat er hoe dan ook.
  let gemaild = false
  try {
    const { error: mailFout } = await supabase.functions.invoke('send-invite', { body: { org_invite_id: rij.id } })
    gemaild = !mailFout
  } catch {
    gemaild = false
  }
  return { link, gemaild }
}

// ---- Bewaartermijn (61) -------------------------------------------------

export const BEWAAR_OPTIES = [6, 12, 24, 36, 60, 120]

export async function bewaartermijn(org: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('bewaartermijn', { org })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return (data as number | null) ?? null
}

export async function bewaartermijnGevolg(org: string, maanden: number): Promise<number> {
  const { data, error } = await supabase.rpc('bewaartermijn_gevolg', { org, maanden })
  if (error) throw error
  return (data as number) ?? 0
}

export async function zetBewaartermijn(org: string, maanden: number): Promise<number> {
  const { data, error } = await supabase.rpc('zet_bewaartermijn', { org, maanden })
  if (error) throw error
  return (data as number) ?? 0
}

export function termijnTekst(maanden: number): string {
  if (maanden % 12 === 0) return maanden === 12 ? '1 jaar' : `${maanden / 12} jaar`
  return `${maanden} maanden`
}

/** Open uitnodigingen van de organisatie; alleen de beheerder mag ze lezen (60). */
export async function openOrgUitnodigingen(org: string): Promise<{ id: string; email: string; expires_at: string }[] | null> {
  const { data, error } = await supabase
    .from('org_invitation')
    .select('id, email, expires_at')
    .eq('org_id', org)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) return null
  return (data ?? []) as { id: string; email: string; expires_at: string }[]
}

// ---- Medewerkers beheren (70) ------------------------------------------

export async function zetMedewerkerRol(org: string, profiel: string, rol: OrgRol): Promise<void> {
  const { data, error } = await supabase
    .from('org_membership')
    .update({ role: rol })
    .eq('org_id', org)
    .eq('profile_id', profiel)
    .select('profile_id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder kan dit aanpassen.')
}

export async function zetMedewerkerActief(org: string, profiel: string, actief: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('org_membership')
    .update({ active: actief })
    .eq('org_id', org)
    .eq('profile_id', profiel)
    .select('profile_id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Alleen de beheerder kan dit aanpassen.')
}

export async function trekUitnodigingIn(id: string): Promise<void> {
  const { error } = await supabase.rpc('trek_uitnodiging_in', { uitnodiging: id })
  if (error) throw error
}

/** 14 nieuwe dagen, en de mail opnieuw. De mail mag mislukken: de link blijft dezelfde. */
export async function stuurUitnodigingOpnieuw(id: string): Promise<{ gemaild: boolean }> {
  const { error } = await supabase.rpc('verleng_uitnodiging', { uitnodiging: id })
  if (error) throw error
  try {
    const { error: mailFout } = await supabase.functions.invoke('send-invite', { body: { org_invite_id: id } })
    return { gemaild: !mailFout }
  } catch {
    return { gemaild: false }
  }
}

export type EindReden = 'verhuisd' | 'overleden' | 'andere'

/** Het WZC sluit het verblijf af (71): het team verliest toegang, de familie houdt alles. */
export async function beeindigVerblijf(hh: string, reden: EindReden): Promise<void> {
  const { error } = await supabase.rpc('beeindig_verblijf', { hh, reden })
  if (error) throw error
}

export async function toewijzingen(org: string) {
  const { data, error } = await supabase
    .from('care_assignment')
    .select('id, profile_id, valid_from, valid_until, stay:stay_id (household_id, org_id, ended_at)')
    .is('valid_until', null)
  if (error) return []
  type Rij = { id: string; profile_id: string; stay: { household_id: string; org_id: string; ended_at: string | null } | null }
  return ((data ?? []) as unknown as Rij[])
    .filter((r) => r.stay && r.stay.org_id === org && !r.stay.ended_at)
    .map((r) => ({ id: r.id, profile_id: r.profile_id, household_id: r.stay!.household_id }))
}

export async function wijsToe(hh: string, profiel: string) {
  const { error } = await supabase.rpc('wijs_toe', { hh, profiel })
  if (error) throw error
}

export async function stopToewijzing(id: string) {
  const { error } = await supabase.rpc('stop_toewijzing', { toewijzing: id })
  if (error) throw error
}

export async function zetVerblijf(hh: string, afdeling: string | null, kamer: string) {
  const { error } = await supabase.rpc('zet_verblijf', { hh, afdeling, kamer })
  if (error) throw error
}

export async function actieveBewoners(org: string, van: string, tot: string) {
  return rpcLijst<{ dag: string; aantal: number }>('actieve_bewoners', { org, van, tot })
}

// ---- Uitnodiging ------------------------------------------------------

export async function bekijkUitnodiging(token: string) {
  const rijen = await rpcLijst<{ organisatie: string; rol: OrgRol; email: string; status: string }>(
    'org_uitnodiging_bekijk',
    { uitnodiging: token },
  )
  return rijen[0] ?? null
}

export async function aanvaardUitnodiging(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('aanvaard_org_uitnodiging', { uitnodiging: token })
  if (error) throw error
  return data as string
}

export interface OpenUitnodiging {
  id: string
  organisatie: string
  rol: OrgRol
  verloopt: string
}

/** Open uitnodigingen voor het e-mailadres waarmee je bent ingelogd (67). */
export function mijnUitnodigingen(): Promise<OpenUitnodiging[]> {
  return rpcLijst<OpenUitnodiging>('mijn_org_uitnodigingen')
}

export async function aanvaardInApp(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('aanvaard_org_uitnodiging_id', { uitnodiging: id })
  if (error) throw error
  return data as string
}

// ---- Familie: koppelen ------------------------------------------------

export async function mijnWzc(hh: string) {
  const rijen = await rpcLijst<{ org_id: string; naam: string; sinds: string | null; afdeling: string | null; kamer: string | null }>(
    'mijn_wzc',
    { hh },
  )
  return rijen[0] ?? null
}

export const ONBEKENDE_CODE =
  'Deze code kennen we niet. Kijk ze na of vraag ze opnieuw aan het woonzorgcentrum.'

export async function koppelMetWzc(hh: string, code: string): Promise<string> {
  const { data, error } = await supabase.rpc('koppel_met_wzc', { hh, code })
  if (error) throw error
  // Vanaf 65 geeft een onbekende code geen fout maar niets terug (zodat de
  // poging geteld wordt).
  if (!data) throw new Error(ONBEKENDE_CODE)
  return data as string
}

export async function ontkoppelWzc(hh: string) {
  const { error } = await supabase.rpc('unlink_household_from_org', { hh })
  if (error) throw error
}

export const ROLNAAM: Record<OrgRol, string> = {
  org_admin: 'Beheerder',
  coordinator: 'Coördinator',
  caregiver: 'Zorgmedewerker',
}

// ---- Bewaartermijn overdracht (62) ---------------------------------------

export const OVERDRACHT_OPTIES = [7, 14, 30, 60, 90, 180, 365]

export function dagenTekst(dagen: number): string {
  if (dagen === 7) return '1 week'
  if (dagen === 14) return '2 weken'
  if (dagen === 365) return '1 jaar'
  return `${dagen} dagen`
}

export async function overdrachtTermijn(org: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('overdracht_termijn', { org })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return (data as number | null) ?? null
}

export async function overdrachtTermijnGevolg(org: string, dagen: number): Promise<number> {
  const { data, error } = await supabase.rpc('overdracht_termijn_gevolg', { org, dagen })
  if (error) throw error
  return (data as number) ?? 0
}

export async function zetOverdrachtTermijn(org: string, dagen: number) {
  const { error } = await supabase.rpc('zet_overdracht_termijn', { org, dagen })
  if (error) throw error
}

// ---- Teamberichten (63) ---------------------------------------------------

export interface Teambericht {
  id: string
  department_id: string
  body: string
  author_id: string | null
  created_at: string
}

export async function teamberichten(afdeling: string): Promise<Teambericht[]> {
  const { data, error } = await supabase
    .from('team_message')
    .select('id, department_id, body, author_id, created_at')
    .eq('department_id', afdeling)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return ((data ?? []) as Teambericht[]).reverse()
}

export async function stuurTeambericht(afdeling: string, body: string, ik: string) {
  const { error } = await supabase.from('team_message').insert({ department_id: afdeling, body: body.trim(), author_id: ik })
  if (error) throw error
}

export async function wisTeambericht(id: string) {
  const { error } = await supabase.from('team_message').delete().eq('id', id)
  if (error) throw error
}

/** Een eigen bericht mag nog weg binnen 10 minuten (zelfde regel als de database). */
export function nogWisbaar(created_at: string, nu = Date.now()): boolean {
  return nu - new Date(created_at).getTime() < 10 * 60_000
}

export async function teamberichtTermijn(org: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('teambericht_termijn', { org })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return (data as number | null) ?? null
}

export async function teamberichtTermijnGevolg(org: string, dagen: number): Promise<number> {
  const { data, error } = await supabase.rpc('teambericht_termijn_gevolg', { org, dagen })
  if (error) throw error
  return (data as number) ?? 0
}

export async function zetTeamberichtTermijn(org: string, dagen: number) {
  const { error } = await supabase.rpc('zet_teambericht_termijn', { org, dagen })
  if (error) throw error
}

// ---- Wie volgt mijn familielid (64) -----------------------------------------

export async function zorgteam(hh: string) {
  return rpcLijst<{ naam: string; rol: 'toegewezen' | 'team lead'; sinds: string }>('zorgteam', { hh })
}
