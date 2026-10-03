import { describe, expect, it } from 'vitest'
import { dagenTekst, huisNaarAgenda, isHuis, samenVoegen, telt, uurKort, type HuisMoment } from './afdelingsdagPuur'
import { whatNow } from '../features/today/whatNow'
import type { AgendaEvent } from './agenda'

const m = (p: Partial<HuisMoment>): HuisMoment => ({
  bron: 'vast', id: 'x', titel: 'Middagmaal', soort: 'maaltijd', emoji: null,
  begint: '2026-10-02T12:00:00+02:00', eindigt: '2026-10-02T13:00:00+02:00',
  plaats: null, status: null, deelname: null, ...p,
})
const eigen: AgendaEvent = {
  id: 'e1', household_id: 'hh', starts_at: '2026-10-02T10:30:00+02:00', title: 'Els komt', emoji: '👩',
  kind: 'visit', note: null, person_id: null, done_at: null,
}

describe('de dag van de afdeling op de tablet (78)', () => {
  it('wordt een agenda-item met een eigen id, emoji naar soort en de plaats als uitleg', () => {
    const [e] = huisNaarAgenda([m({ plaats: 'Restaurant' })], 'hh', new Date('2026-10-02T11:00:00+02:00'))
    expect(e.id).toBe('huis:x')
    expect(isHuis(e)).toBe(true)
    expect(isHuis(eigen)).toBe(false)
    expect(e.emoji).toBe('🍽️')
    expect(e.kind).toBe('meal')
    expect(e.note).toBe('Restaurant')
    expect(e.done_at).toBeNull()
  })

  it('is "nu" tijdens het moment en daarna voorbij, nooit langer', () => {
    const lijst = [m({})]
    const tijdens = huisNaarAgenda(lijst, 'hh', new Date('2026-10-02T12:30:00+02:00'))
    expect(whatNow(tijdens, new Date('2026-10-02T12:30:00+02:00')).current?.id).toBe('huis:x')
    const na = huisNaarAgenda(lijst, 'hh', new Date('2026-10-02T13:10:00+02:00'))
    expect(na[0].done_at).toBe(new Date('2026-10-02T13:00:00+02:00').toISOString())
    expect(whatNow(na, new Date('2026-10-02T13:10:00+02:00')).current).toBeNull()
  })

  it('zonder einduur een uur lang', () => {
    const [e] = huisNaarAgenda([m({ eindigt: null })], 'hh', new Date('2026-10-02T13:05:00+02:00'))
    expect(e.done_at).not.toBeNull()
  })

  it('laat geannuleerde activiteiten en afwezigheid weg', () => {
    expect(telt(m({ bron: 'activiteit', status: 'geannuleerd' }))).toBe(false)
    expect(telt(m({ bron: 'activiteit', status: 'gepland', deelname: 'afwezig' }))).toBe(false)
    expect(telt(m({ bron: 'activiteit', status: 'gepland', deelname: 'ingeschreven' }))).toBe(true)
  })

  it('voegt samen op tijd, en laat de eigen agenda ongemoeid als er niets van het huis is', () => {
    const agenda = [eigen]
    expect(samenVoegen(agenda, [])).toBe(agenda)
    const samen = samenVoegen(agenda, huisNaarAgenda([m({ begint: '2026-10-02T08:00:00+02:00', eindigt: null, titel: 'Ontbijt' })], 'hh', new Date('2026-10-02T07:00:00+02:00')))
    expect(samen.map((e) => e.title)).toEqual(['Ontbijt', 'Els komt'])
  })

  it('dagen en uren in gewone woorden', () => {
    expect(dagenTekst([1, 2, 3, 4, 5, 6, 7])).toBe('elke dag')
    expect(dagenTekst([5, 4, 3, 2, 1])).toBe('weekdagen')
    expect(dagenTekst([6, 7])).toBe('weekend')
    expect(dagenTekst([1, 3, 5])).toBe('ma, wo, vr')
    expect(uurKort('12:00:00')).toBe('12:00')
  })
})
