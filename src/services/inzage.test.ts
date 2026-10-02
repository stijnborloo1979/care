import { describe, expect, it } from 'vitest'
import { noodStatus, perDag, watZin, wie } from './inzage'

describe('wie bekeek wat, in gewone taal', () => {
  it('de naam als we die kennen, anders de rol', () => {
    expect(wie({ actor_id: 'a', rol: 'member' }, { a: 'Els' })).toBe('Els')
    expect(wie({ actor_id: 'b', rol: 'caregiver' }, { a: 'Els' })).toBe('Een zorgverlener')
    expect(wie({ actor_id: null, rol: null }, {})).toBe('Iemand')
  })

  it('wat er bekeken werd', () => {
    expect(watZin({ soort: 'document', row_id: 'd' }, { d: 'ID-kaart' })).toBe('opende het document „ID-kaart”')
    expect(watZin({ soort: 'document', row_id: 'weg' }, {})).toBe('opende een document')
    expect(watZin({ soort: 'life_story', row_id: 'v' }, { v: 'Onze trouwdag' })).toBe('beluisterde „Onze trouwdag”')
    expect(watZin({ soort: 'location_point', row_id: null }, {})).toBe('bekeek de locatie')
  })

  it('per dag, nieuwste eerst', () => {
    const nu = new Date(2026, 9, 1, 12, 0)
    const rijen = [
      { at: new Date(2026, 9, 1, 9, 0).toISOString() },
      { at: new Date(2026, 9, 1, 8, 0).toISOString() },
      { at: new Date(2026, 8, 30, 20, 0).toISOString() },
      { at: new Date(2026, 8, 28, 10, 0).toISOString() },
    ]
    const groepen = perDag(rijen, nu)
    expect(groepen.map(([d, r]) => [d, r.length])).toEqual([
      ['Vandaag', 2],
      ['Gisteren', 1],
      [new Date(2026, 8, 28).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' }), 1],
    ])
  })
})

describe('noodtoegang', () => {
  const nu = new Date('2026-10-01T10:00:00Z')
  it('loopt, gestopt of afgelopen', () => {
    expect(noodStatus({ ended_at: null, expires_at: '2026-10-01T12:00:00Z' }, nu)).toBe('loopt')
    expect(noodStatus({ ended_at: '2026-10-01T09:00:00Z', expires_at: '2026-10-01T12:00:00Z' }, nu)).toBe('gestopt')
    expect(noodStatus({ ended_at: null, expires_at: '2026-10-01T09:00:00Z' }, nu)).toBe('verlopen')
  })
})
