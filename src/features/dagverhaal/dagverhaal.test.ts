import { describe, expect, it } from 'vitest'
import { dagverhaal } from './dagverhaal'
import type { Summary } from '../../services/dashboard'

const TZ = 'Europe/Brussels'
const NU = new Date('2026-10-02T17:00:00+02:00')
const ev = (id: string, uur: string, title: string, done = false) => ({
  id, household_id: 'hh', starts_at: `2026-10-02T${uur}:00+02:00`, title, emoji: null, kind: 'other' as const, note: null, person_id: null,
  done_at: done ? `2026-10-02T${uur}:05+02:00` : null,
})
const leeg: Summary = { events: [], meds: [], log: [], alerts: [] }

describe('dagverhaal', () => {
  it('zegt welke dingen afgevinkt zijn, wie er was en wat er nog komt', () => {
    const z = dagverhaal({
      naam: 'Rita', tz: TZ, nu: NU,
      summary: { ...leeg, events: [ev('1', '08:00', 'Ontbijt', true), ev('2', '10:00', 'Wandeling', true), ev('3', '18:00', 'Avondeten')] },
      bezoeken: [{ id: 'b', household_id: 'hh', visitor_name: 'Els', visitor_card: null, note: 'Samen koffie gedronken.', photo_path: null, visited_at: '2026-10-02T15:00:00+02:00', author_id: null, created_at: '' }],
    })
    expect(z.zinnen).toEqual([
      'Rita vinkte vandaag ontbijt en wandeling af.',
      'Els was op bezoek in de namiddag.',
      'Nog op de planning: avondeten om 18:00.',
    ])
    expect(z.logboek).toEqual(['Els: Samen koffie gedronken.'])
  })
  it('medicatie: alleen of het bevestigd is, nooit wat', () => {
    const z = dagverhaal({
      naam: 'Rita', tz: TZ, nu: NU, bezoeken: [],
      summary: { ...leeg, meds: [
        { id: 'm1', name: 'Dafalgan', dose: '1g', due_at: '2026-10-02T08:00:00+02:00', taken_at: '2026-10-02T08:10:00+02:00' },
        { id: 'm2', name: 'Dafalgan', dose: '1g', due_at: '2026-10-02T14:00:00+02:00', taken_at: null },
        { id: 'm3', name: 'X', dose: null, due_at: '2026-10-02T20:00:00+02:00', taken_at: null },
      ] },
    })
    expect(z.zinnen).toEqual(['De medicatie van 14:00 is nog niet bevestigd.'])
    expect(z.zinnen.join(' ')).not.toMatch(/Dafalgan/)
  })
  it('automatische logboekregels komen er niet in, eigen notities wel', () => {
    const z = dagverhaal({
      naam: 'Rita', tz: TZ, nu: NU, bezoeken: [],
      summary: { ...leeg, log: [
        { id: 'l1', occurred_at: '2026-10-02T09:00:00+02:00', title: 'Ibuprofen bevestigd', note: null, source: 'person' },
        { id: 'l2', occurred_at: '2026-10-02T11:00:00+02:00', title: 'Medicatie nemen afgevinkt', note: null, source: 'family' },
        { id: 'l3', occurred_at: '2026-10-02T12:00:00+02:00', title: 'Samen gewandeld', note: 'Vandaag wat vermoeid.', source: 'family' },
      ] },
    })
    expect(z.logboek).toEqual(['Samen gewandeld — Vandaag wat vermoeid.'])
    expect(z.zinnen).toEqual(['Over vandaag staat er nog niets in de app.'])
  })
  it('geen medicatie bij naam, ook niet via de agenda, het logboek of een bezoek', () => {
    const z = dagverhaal({
      naam: 'Rita', tz: TZ, nu: NU,
      summary: {
        ...leeg,
        events: [{ ...ev('1', '08:00', 'Dafalgan 1g', true), kind: 'med' as const }, ev('2', '09:00', 'Ontbijt', true)],
        meds: [{ id: 'm', name: 'Dafalgan bruis', dose: null, due_at: '2026-10-02T08:00:00+02:00', taken_at: '2026-10-02T08:05:00+02:00' }],
        log: [{ id: 'l', occurred_at: '2026-10-02T12:00:00+02:00', title: 'Ibuprofen gegeven', note: null, source: 'family' },
              { id: 'l2', occurred_at: '2026-10-02T12:30:00+02:00', title: 'Nieuw lid toegevoegd: jan', note: null, source: 'family' }],
      },
      bezoeken: [{ id: 'b', household_id: 'hh', visitor_name: 'Els', visitor_card: null, note: 'Dafalgan gegeven', photo_path: null, visited_at: '2026-10-02T15:00:00+02:00', author_id: null, created_at: '' }],
    })
    // Wat doorgestuurd wordt, noemt nooit een medicijn of een lid.
    expect(z.zinnen.join(' ')).not.toMatch(/dafalgan|ibuprofen|lid/i)
    expect(z.zinnen).toContain('Els was op bezoek in de namiddag.')
    expect(z.zinnen).toContain('Alle medicatie tot nu toe is bevestigd.')
    // Vrije tekst blijft in de app; ook daar geen gepland medicijn of automatische regel.
    expect(z.logboek.join(' ')).not.toMatch(/dafalgan|lid/i)
  })
  it('een lege dag zegt dat eerlijk', () => {
    expect(dagverhaal({ naam: 'Rita', tz: TZ, nu: NU, bezoeken: [], summary: leeg }).zinnen).toEqual(['Over vandaag staat er nog niets in de app.'])
  })
})
