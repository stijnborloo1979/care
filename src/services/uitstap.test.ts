import { afterEach, describe, expect, it } from 'vitest'
import { actueel, naarLokaleTijd, toestand, uitLokaleTijd, uitstapNaarAgenda, vanTot, type Uitstap } from './uitstapPuur'
import { isHuis } from './afdelingsdagPuur'
import { whatNow } from '../features/today/whatNow'
import { zetTaal } from '../lib/i18n'
import { sindsTekst } from './spullen'
import { dagverhaal } from '../features/dagverhaal/dagverhaal'

const TZ = 'Europe/Brussels'
const u = (p: Partial<Uitstap>): Uitstap => ({
  id: 'u1', household_id: 'hh', met_wie: 'Els', vertrek: '2026-10-03T14:00:00+02:00', terug: '2026-10-03T17:00:00+02:00',
  notitie: 'Naar de markt', status: 'gepland', vertrokken_at: null, terug_at: null, created_by: null, created_at: '', ...p,
})

afterEach(() => zetTaal('nl'))

describe('uitstap (80)', () => {
  it('staat op de tablet op het uur van vertrek, met wanneer ze terug is', () => {
    const nu = new Date('2026-10-03T13:50:00+02:00')
    const [e] = uitstapNaarAgenda([u({})], 'hh', nu, TZ)
    expect(e.title).toBe('Uitstap met Els')
    expect(e.note).toBe('Je bent terug om 17:00.')
    expect(isHuis(e)).toBe(true)
    expect(whatNow([e], nu).current?.id).toBe(e.id)
    expect(e.note).not.toContain('markt')
  })
  it('zegt "je bent op uitstap" zodra ze vertrokken is, en in de taal van de tablet', () => {
    zetTaal('fr')
    const [e] = uitstapNaarAgenda([u({ status: 'weg' })], 'hh', new Date('2026-10-03T15:00:00+02:00'), TZ)
    expect(e.title).toBe('Tu es en sortie avec Els')
  })
  it('laat geannuleerd en een andere dag weg; terug is voorbij', () => {
    const nu = new Date('2026-10-03T18:00:00+02:00')
    expect(uitstapNaarAgenda([u({ status: 'geannuleerd' })], 'hh', nu, TZ)).toEqual([])
    expect(uitstapNaarAgenda([u({ vertrek: '2026-10-05T14:00:00+02:00', terug: '2026-10-05T17:00:00+02:00' })], 'hh', nu, TZ)).toEqual([])
    const [e] = uitstapNaarAgenda([u({ status: 'terug', terug_at: '2026-10-03T16:50:00+02:00' })], 'hh', nu, TZ)
    expect(e.done_at).toBe('2026-10-03T16:50:00+02:00')
  })
  it('een half uur te laat en niet terug aangeduid: opvolgen', () => {
    expect(toestand(u({ status: 'weg' }), new Date('2026-10-03T17:20:00+02:00'))).toBe('weg')
    expect(toestand(u({ status: 'weg' }), new Date('2026-10-03T17:40:00+02:00'))).toBe('te-laat')
    expect(toestand(u({ status: 'gepland' }), new Date('2026-10-03T19:00:00+02:00'))).toBe('gepland')
  })
  it('actueel: lopend en de komende week; niet wat voorbij of geannuleerd is', () => {
    const nu = new Date('2026-10-03T10:00:00+02:00')
    expect(actueel(u({}), nu, TZ)).toBe(true)
    expect(actueel(u({ status: 'terug' }), nu, TZ)).toBe(false)
    expect(actueel(u({ vertrek: '2026-10-20T10:00:00+02:00', terug: '2026-10-20T12:00:00+02:00' }), nu, TZ)).toBe(false)
  })
  it('een geplande uitstap die nooit vertrok, staat er na het einde niet meer', () => {
    expect(uitstapNaarAgenda([u({})], 'hh', new Date('2026-10-03T18:00:00+02:00'), TZ)).toEqual([])
  })
  it('tijden in de tijdzone van de bewoner, ook over de zomertijd heen', () => {
    expect(uitLokaleTijd('2026-10-03T14:00', TZ).toISOString()).toBe('2026-10-03T12:00:00.000Z')
    expect(uitLokaleTijd('2026-12-03T14:00', TZ).toISOString()).toBe('2026-12-03T13:00:00.000Z')
    expect(uitLokaleTijd('2026-10-25T02:30', TZ).getTime()).toBeGreaterThan(0)
    expect(naarLokaleTijd(new Date('2026-10-03T12:00:00Z'), TZ)).toBe('2026-10-03T14:00')
    expect(naarLokaleTijd(uitLokaleTijd('2026-07-01T09:15', 'America/New_York'), 'America/New_York')).toBe('2026-07-01T09:15')
  })
  it('van-tot in gewone woorden', () => {
    expect(vanTot(u({}), TZ, new Date('2026-10-03T10:00:00+02:00'))).toBe('vandaag 14:00–17:00')
  })
  it('in het dagverhaal: met wie, nooit de notitie', () => {
    const z = dagverhaal({
      naam: 'Rita', tz: TZ, nu: new Date('2026-10-03T18:00:00+02:00'), bezoeken: [],
      summary: { events: [], meds: [], log: [], alerts: [] },
      uitstappen: [u({ status: 'terug', vertrokken_at: '2026-10-03T14:05:00+02:00' }), u({ id: 'u2', met_wie: 'Jan', status: 'geannuleerd' })],
    })
    expect(z.zinnen[0]).toBe('Rita was op uitstap met Els.')
    expect(z.zinnen.join(' ')).not.toMatch(/markt|Jan/)
  })
})

describe('spullen (81)', () => {
  it('kwijt sinds, in gewone woorden', () => {
    const nu = new Date('2026-10-03T12:00:00Z')
    expect(sindsTekst('2026-10-03T11:30:00Z', nu)).toBe('net gemeld')
    expect(sindsTekst('2026-10-03T07:00:00Z', nu)).toBe('sinds 5 uur')
    expect(sindsTekst('2026-10-02T09:00:00Z', nu)).toBe('sinds gisteren')
    expect(sindsTekst('2026-09-29T09:00:00Z', nu)).toBe('sinds 4 dagen')
  })
})
