import { describe, expect, it } from 'vitest'
import { aandachtspunten, cijfers } from './overzicht'
import type { Bewoner, Medewerker } from './zorgApi'

const afd = [{ id: 'a1', name: 'Gelijkvloers' }, { id: 'a2', name: 'Eerste' }]
const bew = (id: string, afdeling: string | null, kamer: string | null): Bewoner => ({ household_id: id, naam: `B${id}`, afdeling, kamer })
const med = (id: string, rol: Medewerker['rol'], afdelingen: Medewerker['afdelingen'] = [], actief = true): Medewerker => ({
  profile_id: id, naam: `M${id}`, email: null, rol, actief, afdelingen,
})

describe('aandachtspunten', () => {
  it('bewoner zonder toewijzing en zonder team lead: hoog', () => {
    const p = aandachtspunten({ bewoners: [bew('1', 'Gelijkvloers', '4')], toewijzingen: [], medewerkers: [], afdelingen: afd })
    expect(p[0]).toMatchObject({ ernst: 'hoog', tekst: expect.stringContaining('Niemand volgt B1') })
  })
  it('een team lead op de afdeling volstaat', () => {
    const lead = med('t', 'caregiver', [{ id: 'a1', naam: 'Gelijkvloers', rol: 'team_lead', rij: 'r' }])
    const p = aandachtspunten({ bewoners: [bew('1', 'Gelijkvloers', '4')], toewijzingen: [], medewerkers: [lead], afdelingen: afd })
    expect(p.some((x) => x.tekst.includes('Niemand volgt'))).toBe(false)
  })
  it('een team lead uit dienst telt niet', () => {
    const lead = med('t', 'caregiver', [{ id: 'a1', naam: 'Gelijkvloers', rol: 'team_lead', rij: 'r' }], false)
    const p = aandachtspunten({ bewoners: [bew('1', 'Gelijkvloers', '4')], toewijzingen: [], medewerkers: [lead], afdelingen: afd })
    expect(p.some((x) => x.tekst.includes('Niemand volgt'))).toBe(true)
  })
  it('geen afdeling, of geen kamer', () => {
    const p = aandachtspunten({
      bewoners: [bew('1', null, null), bew('2', 'Eerste', null)],
      toewijzingen: [{ household_id: '1', profile_id: 'x' }, { household_id: '2', profile_id: 'x' }],
      medewerkers: [], afdelingen: afd,
    })
    expect(p.map((x) => x.tekst)).toEqual(expect.arrayContaining(['B1 heeft nog geen afdeling.', 'B2 heeft nog geen kamer.']))
  })
  it('afdeling zonder team lead en medewerker zonder afdeling', () => {
    const p = aandachtspunten({ bewoners: [], toewijzingen: [], medewerkers: [med('z', 'caregiver')], afdelingen: afd })
    expect(p.filter((x) => x.tekst.includes('geen team lead'))).toHaveLength(2)
    expect(p.some((x) => x.tekst === 'Mz staat op geen enkele afdeling.')).toBe(true)
  })
  it('uitnodiging die binnen 3 dagen verloopt; verlopen telt niet', () => {
    const nu = new Date('2026-10-02T12:00:00Z')
    const p = aandachtspunten({
      bewoners: [], toewijzingen: [], medewerkers: [], afdelingen: [], nu,
      uitnodigingen: [
        { id: 'i1', email: 'a@b', expires_at: '2026-10-04T12:00:00Z' },
        { id: 'i2', email: 'c@d', expires_at: '2026-10-01T12:00:00Z' },
        { id: 'i3', email: 'e@f', expires_at: '2026-10-14T12:00:00Z' },
      ],
    })
    expect(p.map((x) => x.sleutel)).toEqual(['inv-i1'])
  })
})

describe('cijfers', () => {
  it('telt actieve medewerkers zonder beheerders; uitnodigingen null voor wie ze niet mag zien', () => {
    const c = cijfers({ bewoners: [bew('1', null, null)], medewerkers: [med('a', 'org_admin'), med('b', 'caregiver'), med('c', 'coordinator', [], false)], afdelingen: afd, uitnodigingen: null })
    expect(c).toEqual({ bewoners: 1, medewerkers: 1, afdelingen: 2, uitnodigingen: null })
  })
})
