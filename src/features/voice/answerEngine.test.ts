import { describe, expect, it } from 'vitest'
import { beantwoord, type Kennis } from './answerEngine'

const NU = new Date('2026-03-10T12:15:00+01:00')

const kennis: Kennis = {
  tz: 'Europe/Brussels',
  events: [
    {
      id: 'e1',
      household_id: 'hh',
      starts_at: '2026-03-10T12:30:00+01:00',
      title: 'Lunch',
      emoji: '🍽️',
      kind: 'meal',
      note: 'Er staat soep in de koelkast.',
      person_id: null,
      done_at: null,
    },
    {
      id: 'e2',
      household_id: 'hh',
      starts_at: '2026-03-10T14:00:00+01:00',
      title: 'Els komt langs',
      emoji: '👩',
      kind: 'visit',
      note: null,
      person_id: 'p1',
      done_at: null,
    },
  ],
  items: [
    {
      id: 'i1',
      household_id: 'hh',
      room_id: 'r1',
      name: 'Bril',
      emoji: '👓',
      where_text: 'Op het nachtkastje.',
      photo_path: null,
      updated_at: '',
    },
  ],
  people: [
    {
      id: 'p1',
      household_id: 'hh',
      profile_id: null,
      name: 'Els',
      relation: 'Dochter',
      description: 'Els is je dochter.',
      detail: null,
      phone: '0475 12 34 56',
      emoji: null,
      color: null,
      photo_path: null,
      kind: 'family',
      sort: 1,
    },
  ],
  notes: [
    {
      id: 'n1',
      household_id: 'hh',
      category: 'dingen',
      title: 'Reservehuissleutel',
      body: 'Bij de buurvrouw, Rita.',
      tags: [],
    },
  ],
}

describe('beantwoord', () => {
  it('beantwoordt "wat moet ik nu doen" met het item van dit moment', () => {
    const a = beantwoord('Wat moet ik nu doen?', kennis, NU)
    expect(a.titel).toContain('Lunch')
    expect(a.regels[0]).toBe('Er staat soep in de koelkast.')
  })

  it('zegt erbij wat er daarna komt', () => {
    const a = beantwoord('Wat moet ik nu doen?', kennis, NU)
    expect(a.regels.join(' ')).toContain('14:00')
  })

  it('vindt waar iets ligt', () => {
    const a = beantwoord('Waar is mijn bril?', kennis, NU)
    expect(a.regels[0]).toBe('Op het nachtkastje.')
    expect(a.link?.naar).toBe('/memory/ding/i1')
  })

  it('negeert hoofdletters en accenten uit spraakherkenning', () => {
    expect(beantwoord('waar is MIJN BRÌL', kennis, NU).regels[0]).toBe('Op het nachtkastje.')
  })

  it('geeft het telefoonnummer bij een belverzoek', () => {
    const a = beantwoord('Bel Els', kennis, NU)
    expect(a.bellen?.nummer).toBe('0475 12 34 56')
  })

  it('vertelt wanneer iemand komt', () => {
    expect(beantwoord('Wanneer komt Els?', kennis, NU).titel).toBe('Els komt om 14:00')
  })

  it('vindt een weetje op zijn titel', () => {
    expect(beantwoord('Waar is de reservehuissleutel?', kennis, NU).regels[0]).toBe(
      'Bij de buurvrouw, Rita.',
    )
  })

  it('verzint niets wanneer het antwoord er niet is', () => {
    const a = beantwoord('Hoeveel kost een treinticket naar Oostende?', kennis, NU)
    expect(a.titel).toBe('Dat weet ik niet zeker.')
    expect(a.regels[0]).toContain('familie')
  })

  it('zegt eerlijk dat iemand vandaag niet langskomt', () => {
    const leeg = { ...kennis, events: [] }
    expect(beantwoord('Wanneer komt Els?', leeg, NU).titel).toContain('niet in de planning')
  })
})
