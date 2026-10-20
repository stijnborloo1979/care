import { describe, expect, it } from 'vitest'
import type { HuisMoment } from './afdelingsdagPuur'
import { uitstapVervaltMaaltijd, zonderMaaltijdTijdensUitstap, type Uitstap } from './uitstapPuur'

const u = (over: Partial<Uitstap> = {}): Uitstap => ({
  id: 'u1',
  household_id: 'hh',
  met_wie: 'Els',
  vertrek: '2026-10-21T10:00:00Z',
  terug: '2026-10-21T15:00:00Z',
  notitie: null,
  eet_mee: false,
  status: 'gepland',
  vertrokken_at: null,
  terug_at: null,
  created_by: null,
  created_at: '2026-10-20T10:00:00Z',
  ...over,
})

const maaltijd = (begint: string): HuisMoment => ({
  bron: 'vast',
  id: 'm-' + begint,
  titel: 'Middagmaal',
  soort: 'maaltijd',
  emoji: null,
  begint,
  eindigt: null,
  plaats: null,
  status: null,
  deelname: null,
})

describe('uitstapVervaltMaaltijd', () => {
  it('vervalt de maaltijd tijdens een uitstap waar ze niet mee eet', () => {
    expect(uitstapVervaltMaaltijd(u(), new Date('2026-10-21T12:00:00Z'))).toBe(true)
  })

  it('vervalt niets als de familie kiest dat ze blijft eten', () => {
    expect(uitstapVervaltMaaltijd(u({ eet_mee: true }), new Date('2026-10-21T12:00:00Z'))).toBe(false)
  })

  it('geldt alleen binnen het tijdvenster', () => {
    expect(uitstapVervaltMaaltijd(u(), new Date('2026-10-21T09:00:00Z'))).toBe(false)
    expect(uitstapVervaltMaaltijd(u(), new Date('2026-10-21T15:00:00Z'))).toBe(false)
  })

  it('geldt niet voor een geannuleerde of afgeronde uitstap', () => {
    expect(uitstapVervaltMaaltijd(u({ status: 'geannuleerd' }), new Date('2026-10-21T12:00:00Z'))).toBe(false)
    expect(uitstapVervaltMaaltijd(u({ status: 'terug' }), new Date('2026-10-21T12:00:00Z'))).toBe(false)
  })
})

describe('zonderMaaltijdTijdensUitstap', () => {
  it('haalt alleen de maaltijd tijdens de uitstap weg, niet de andere momenten', () => {
    const huis = [maaltijd('2026-10-21T08:00:00Z'), maaltijd('2026-10-21T12:00:00Z'), { ...maaltijd('2026-10-21T12:30:00Z'), soort: 'rust' as const }]
    const r = zonderMaaltijdTijdensUitstap(huis, [u()])
    expect(r.map((m) => m.begint)).toEqual(['2026-10-21T08:00:00Z', '2026-10-21T12:30:00Z'])
  })

  it('laat alles staan als ze blijft eten', () => {
    const huis = [maaltijd('2026-10-21T12:00:00Z')]
    expect(zonderMaaltijdTijdensUitstap(huis, [u({ eet_mee: true })])).toEqual(huis)
  })
})
