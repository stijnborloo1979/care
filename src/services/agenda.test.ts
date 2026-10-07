import { describe, expect, it } from 'vitest'
import { isGemist, type AgendaEvent } from './agenda'

const nu = new Date('2026-10-07T21:00:00+02:00')
const moment = (starts_at: string, extra: Partial<AgendaEvent> = {}): AgendaEvent => ({
  id: 'x', household_id: 'h', starts_at, title: 'Ontbijt', emoji: null, kind: 'meal',
  note: null, person_id: null, done_at: null, ...extra,
})

describe('isGemist', () => {
  it('telt een moment dat meer dan een uur voorbij is en niet afgevinkt', () => {
    expect(isGemist(moment('2026-10-07T08:00:00+02:00', { created_at: '2026-10-06T02:30:00+02:00' }), nu)).toBe(true)
  })

  it('telt een afgevinkt moment niet', () => {
    expect(isGemist(moment('2026-10-07T08:00:00+02:00', { done_at: '2026-10-07T08:10:00+02:00' }), nu)).toBe(false)
  })

  it('geeft een uur speling', () => {
    expect(isGemist(moment('2026-10-07T20:15:00+02:00'), nu)).toBe(false)
  })

  it('telt een moment niet dat pas na zijn uur aangemaakt werd', () => {
    // Een gezin stelt om 20:55 de app in; de routine van vandaag staat er
    // dan al met uren die voorbij zijn.
    expect(isGemist(moment('2026-10-07T08:00:00+02:00', { created_at: '2026-10-07T20:55:00+02:00' }), nu)).toBe(false)
  })

  it('telt zonder aanmaaktijd zoals vroeger', () => {
    expect(isGemist(moment('2026-10-07T08:00:00+02:00'), nu)).toBe(true)
  })
})
