import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
import { bezoekZin, voorDeTablet, wanneerTekst, type Bezoek } from '../../services/bezoek'
import { momentNaarTijd } from './BezoekVastleggen'
import { beantwoord, type Kennis } from '../voice/answerEngine'
import { zetTaal } from '../../lib/i18n'

const TZ = 'Europe/Brussels'
const NU = new Date('2026-10-02T17:00:00+02:00')
const b = (id: string, naam: string, iso: string, note: string | null = null): Bezoek => ({
  id, household_id: 'hh', visitor_name: naam, visitor_card: null, note, photo_path: null,
  visited_at: iso, author_id: null, created_at: iso,
})

afterEach(() => zetTaal('nl'))

describe('wanneerTekst', () => {
  it('vandaag in dagdelen', () => {
    expect(wanneerTekst('2026-10-02T09:00:00+02:00', TZ, NU)).toBe('vanmorgen')
    expect(wanneerTekst('2026-10-02T14:30:00+02:00', TZ, NU)).toBe('vanmiddag')
    expect(wanneerTekst('2026-10-02T19:00:00+02:00', TZ, NU)).toBe('vanavond')
  })
  it('gisteren', () => {
    expect(wanneerTekst('2026-10-01T09:00:00+02:00', TZ, NU)).toBe('gisterenmorgen')
    expect(wanneerTekst('2026-10-01T20:00:00+02:00', TZ, NU)).toBe('gisteravond')
  })
  it('eerder: de dag van de week, geen datum', () => {
    expect(wanneerTekst('2026-09-27T15:00:00+02:00', TZ, NU)).toBe('op zondag')
  })
  it('in het Engels', () => {
    zetTaal('en')
    expect(bezoekZin(b('1', 'Els', '2026-10-02T14:30:00+02:00'), TZ, NU)).toBe('Els was here this afternoon.')
  })
})

describe('voorDeTablet', () => {
  it('alleen vandaag en gisteren, nieuwste eerst', () => {
    const l = voorDeTablet(
      [b('a', 'Jan', '2026-09-29T10:00:00+02:00'), b('b', 'Els', '2026-10-01T15:00:00+02:00'), b('c', 'Lea', '2026-10-02T10:00:00+02:00')],
      TZ, NU,
    )
    expect(l.map((x) => x.visitor_name)).toEqual(['Lea', 'Els'])
  })
})

describe('momentNaarTijd', () => {
  it('"Net" is nu', () => expect(momentNaarTijd('nu', '', TZ, NU)).toEqual(NU))
  it('gisteren om 15:00 in de tijdzone van het huishouden', () =>
    expect(momentNaarTijd('gisteren', '15:00', TZ, NU).toISOString()).toBe('2026-10-01T13:00:00.000Z'))
  it('een uur later dan nu wordt nu', () => expect(momentNaarTijd('vandaag', '20:00', TZ, NU)).toEqual(NU))
})

describe('de spraakassistent', () => {
  const kennis: Kennis = { tz: TZ, events: [], items: [], people: [], notes: [] }
  it('"Er komt nooit iemand" krijgt de feiten', () => {
    const a = beantwoord('Er komt nooit iemand', { ...kennis, bezoeken: [b('1', 'Els', '2026-10-02T14:30:00+02:00'), b('2', 'Jan', '2026-09-27T15:00:00+02:00')] }, NU)
    expect(a.titel).toBe('Els was hier vanmiddag.')
    expect(a.regels).toEqual(['Jan was hier op zondag.'])
  })
  it('"Wie was er hier?" zonder bezoeken verzint niets', () => {
    const a = beantwoord('Wie was er hier?', { ...kennis, bezoeken: [] }, NU)
    expect(a.titel).toBe('Er staat deze week geen bezoek genoteerd.')
  })
  it('"Wie komt er vandaag?" noemt ook wie er onlangs was', () => {
    const a = beantwoord('Wie komt er vandaag?', { ...kennis, bezoeken: [b('1', 'Els', '2026-10-01T15:00:00+02:00')] }, NU)
    expect(a.regels).toContain('Els was hier gistermiddag.')
  })
  it('"Wanneer was Els hier?" gaat alleen over Els', () => {
    const a = beantwoord('Wanneer was Els hier?', { ...kennis, bezoeken: [b('1', 'Jan', '2026-10-02T09:00:00+02:00'), b('2', 'Els', '2026-10-01T15:00:00+02:00', 'Koffie.')] }, NU)
    expect(a.titel).toBe('Els was hier gistermiddag.')
    expect(a.regels).toEqual(['Koffie.'])
  })
  it('en zegt eerlijk als Els er niet bij staat', () => {
    const a = beantwoord('Wanneer was Els hier?', {
      ...kennis,
      people: [{ id: 'p1', household_id: 'hh', profile_id: null, name: 'Els', relation: 'Dochter', description: null, detail: null, phone: null, emoji: null, color: null, photo_path: null, kind: 'family', sort: 1 }],
      bezoeken: [b('1', 'Jan', '2026-10-02T09:00:00+02:00')],
    }, NU)
    expect(a.titel).toMatch(/geen bezoek van Els/)
  })
  it('in het Frans', () => {
    zetTaal('fr')
    const a = beantwoord('Personne ne vient jamais', { ...kennis, bezoeken: [b('1', 'Els', '2026-10-02T09:00:00+02:00')] }, NU)
    expect(a.titel).toBe('Els est venu(e) ce matin.')
  })
})
