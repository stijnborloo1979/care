import type { Bewoner, Medewerker } from './zorgApi'
import { tt } from '../../lib/uiTaal'

export interface OpenOrgUitnodiging {
  id: string
  email: string
  expires_at: string
}

export interface Punt {
  /** Uniek, voor React. */
  sleutel: string
  ernst: 'hoog' | 'middel'
  tekst: string
}

export interface Cijfers {
  bewoners: number
  medewerkers: number
  afdelingen: number
  uitnodigingen: number | null
}

const DAG = 24 * 60 * 60_000

/**
 * Wat in een woonzorgcentrum aandacht vraagt, alleen uit gegevens die beheer
 * al ziet: wie waar verblijft en wie voor wie zorgt. Nooit inhoud.
 */
export function aandachtspunten(input: {
  bewoners: Bewoner[]
  toewijzingen: { household_id: string; profile_id: string }[]
  medewerkers: Medewerker[]
  afdelingen: { id: string; name: string }[]
  uitnodigingen?: OpenOrgUitnodiging[] | null
  nu?: Date
}): Punt[] {
  const nu = (input.nu ?? new Date()).getTime()
  const punten: Punt[] = []
  const actief = input.medewerkers.filter((m) => m.actief)

  // Afdelingen met een team lead: die volgt elke bewoner van die afdeling.
  const metLead = new Set<string>()
  for (const m of actief)
    for (const a of m.afdelingen) if (a.rol === 'team_lead') metLead.add(a.id)
  const afdelingId = Object.fromEntries(input.afdelingen.map((a) => [a.name, a.id]))
  const toegewezen = new Set(input.toewijzingen.map((t) => t.household_id))

  for (const b of input.bewoners) {
    const lead = b.afdeling ? metLead.has(afdelingId[b.afdeling] ?? '') : false
    if (!toegewezen.has(b.household_id) && !lead)
      punten.push({ sleutel: `niemand-${b.household_id}`, ernst: 'hoog', tekst: tt('Niemand volgt {naam}. Wijs een medewerker toe.', { naam: b.naam }) })
    if (!b.afdeling)
      punten.push({ sleutel: `afd-${b.household_id}`, ernst: 'middel', tekst: tt('{naam} heeft nog geen afdeling.', { naam: b.naam }) })
    else if (!b.kamer)
      punten.push({ sleutel: `kamer-${b.household_id}`, ernst: 'middel', tekst: tt('{naam} heeft nog geen kamer.', { naam: b.naam }) })
  }

  for (const a of input.afdelingen)
    if (!metLead.has(a.id))
      punten.push({ sleutel: `lead-${a.id}`, ernst: 'middel', tekst: tt('Afdeling {naam} heeft geen team lead.', { naam: a.name }) })

  for (const m of actief)
    if (m.rol === 'caregiver' && m.afdelingen.length === 0)
      punten.push({ sleutel: `zonder-${m.profile_id}`, ernst: 'middel', tekst: tt('{naam} staat op geen enkele afdeling.', { naam: m.naam }) })

  for (const u of input.uitnodigingen ?? []) {
    const over = new Date(u.expires_at).getTime() - nu
    if (over <= 0) continue
    if (over < 3 * DAG)
      punten.push({ sleutel: `inv-${u.id}`, ernst: 'middel', tekst: tt('De uitnodiging voor {email} verloopt binnenkort en is nog niet aanvaard.', { email: u.email }) })
  }

  return punten.sort((x, y) => (x.ernst === y.ernst ? 0 : x.ernst === 'hoog' ? -1 : 1))
}

export function cijfers(input: {
  bewoners: Bewoner[]
  medewerkers: Medewerker[]
  afdelingen: { id: string }[]
  uitnodigingen?: OpenOrgUitnodiging[] | null
  nu?: Date
}): Cijfers {
  const nu = (input.nu ?? new Date()).getTime()
  return {
    bewoners: input.bewoners.length,
    medewerkers: input.medewerkers.filter((m) => m.actief && m.rol !== 'org_admin').length,
    afdelingen: input.afdelingen.length,
    uitnodigingen: input.uitnodigingen ? input.uitnodigingen.filter((u) => new Date(u.expires_at).getTime() > nu).length : null,
  }
}
