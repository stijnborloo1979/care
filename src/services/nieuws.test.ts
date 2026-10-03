import { describe, expect, it } from 'vitest'
import { afzender, isNieuw } from './nieuws'

describe('nieuws van het woonzorgcentrum (79)', () => {
  it('zegt altijd van wie het komt', () => {
    expect(afzender({ van: 'WZC Zonnehof', afdeling: null })).toBe('Van WZC Zonnehof')
    expect(afzender({ van: 'WZC Zonnehof', afdeling: 'Linde' })).toBe('Van WZC Zonnehof · afdeling Linde')
  })
  it('is drie dagen nieuw', () => {
    const nu = new Date('2026-10-03T12:00:00Z')
    expect(isNieuw('2026-10-01T12:00:00Z', nu)).toBe(true)
    expect(isNieuw('2026-09-29T12:00:00Z', nu)).toBe(false)
  })
})
