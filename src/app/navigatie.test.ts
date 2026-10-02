import { describe, expect, it } from 'vitest'
import { NAV, zichtbareNav } from './navigatie'

// De rechten per relatie, zoals de database ze vandaag geeft (48–51).
const RECHTEN: Record<string, string[]> = {
  admin: ['agenda.read', 'care_log.read', 'care_log.write', 'document.read', 'household.write', 'medication.read', 'medication_log.read', 'memories.read', 'message.family.read', 'notes.read', 'people.read', 'routine.read', 'shopping.read', 'task.manage'],
  member: ['agenda.read', 'care_log.read', 'care_log.write', 'document.read', 'medication.read', 'medication_log.read', 'memories.read', 'message.family.read', 'notes.read', 'people.read', 'routine.read', 'shopping.read', 'task.manage'],
  // Fase "zelf": geen toestemming om mee te kijken, dus geen care_log.read en medication_log.read.
  memberZelf: ['agenda.read', 'care_log.write', 'document.read', 'medication.read', 'memories.read', 'message.family.read', 'notes.read', 'people.read', 'routine.read', 'shopping.read', 'task.manage'],
  caregiver: ['agenda.read', 'care_log.read', 'care_log.write', 'medication.read', 'medication_log.read', 'memories.read', 'notes.read', 'people.read', 'routine.read', 'shopping.read'],
}
const labels = (rel: string) =>
  zichtbareNav(NAV, { bekend: true, can: (p) => RECHTEN[rel].includes(p) }).map((n) => n.label)

describe('familienavigatie op rechten', () => {
  it('rechten onbekend: alles, zoals voorheen', () => {
    expect(zichtbareNav(NAV, { bekend: false, can: () => false })).toHaveLength(NAV.length)
  })

  it('de familiebeheerder verliest niets', () => {
    expect(labels('admin')).toHaveLength(NAV.length)
  })

  it('een familielid verliest alleen Indeling (bewaren kon toch niet)', () => {
    expect(NAV.map((n) => n.label).filter((l) => !labels('member').includes(l))).toEqual(['Indeling'])
  })

  it('in fase zelf blijft het zorglogboek (schrijven mag), Analyse niet', () => {
    expect(labels('memberZelf')).toContain('Zorglogboek')
    expect(labels('memberZelf')).not.toContain('Analyse')
  })

  it('een zorgverlener ziet geen berichten, taken, documenten of indeling', () => {
    const weg = NAV.map((n) => n.label).filter((l) => !labels('caregiver').includes(l))
    expect(weg).toEqual(['Berichten', 'Taken', 'Indeling', 'Documenten'])
  })

  it('Dashboard, Home Memory, Wie ziet wat en Instellingen zijn er altijd', () => {
    const altijd = zichtbareNav(NAV, { bekend: true, can: () => false }).map((n) => n.label)
    expect(altijd).toEqual(['Dashboard', 'Home Memory', 'Wie ziet wat', 'Instellingen'])
  })
})

describe('mag', () => {
  it('de database als die het weet, anders de oude rolcontrole', async () => {
    const { mag } = await import('../core/access/useAccess')
    expect(mag({ bekend: true, can: (p) => p === 'membership.manage' }, 'membership.manage', false)).toBe(true)
    expect(mag({ bekend: true, can: () => false }, 'membership.manage', true)).toBe(false)
    expect(mag({ bekend: false, can: () => false }, 'membership.manage', true)).toBe(true)
  })
})
