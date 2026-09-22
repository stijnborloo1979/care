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

describe('heb ik dit al gedaan', () => {
  const med = (id: string, uur: string, genomen: string | null) => ({
    id,
    naam: 'Metformine',
    due_at: `2026-03-10T${uur}:00+01:00`,
    taken_at: genomen ? `2026-03-10T${genomen}:00+01:00` : null,
  })

  it('zegt ja, met het tijdstip, als de medicatie bevestigd is', () => {
    const k = { ...kennis, medicatie: [med('m1', '08:30', '08:42')] }
    const a = beantwoord('Heb ik mijn pillen al genomen?', k, NU)
    expect(a.titel).toBe('Ja, dat heb je gedaan.')
    expect(a.regels[0]).toContain('08:42')
    expect(a.bevestig).toBeUndefined()
  })

  it('zegt nog niet, en biedt aan om te bevestigen', () => {
    const k = { ...kennis, medicatie: [med('m1', '08:30', null)] }
    const a = beantwoord('heb ik mijn medicatie al genomen', k, NU)
    expect(a.titel).toBe('Nog niet.')
    expect(a.bevestig).toEqual(['m1'])
  })

  it('vraagt niets te bevestigen wat pas later vandaag moet', () => {
    const k = { ...kennis, medicatie: [med('m2', '21:00', null)] }
    const a = beantwoord('Heb ik mijn pillen al genomen?', k, NU)
    expect(a.titel).toBe('Nog niet nodig.')
    expect(a.regels[0]).toContain('21:00')
  })

  it('weet of de lunch al voorbij is', () => {
    const k = {
      ...kennis,
      events: [{ ...kennis.events[0], done_at: '2026-03-10T12:40:00+01:00' }],
    }
    const a = beantwoord('Heb ik al gegeten?', k, new Date('2026-03-10T13:30:00+01:00'))
    expect(a.titel).toBe('Ja, dat heb je gedaan.')
    expect(a.regels[0]).toContain('12:40')
  })
})

describe('onthoud dit', () => {
  const eigen = [
    {
      id: 'q2',
      household_id: 'hh',
      body: 'Mijn sleutels liggen in de inkomhal.',
      created_at: '2026-03-10T10:14:00+01:00',
    },
    {
      id: 'q1',
      household_id: 'hh',
      body: 'De sleutel ligt op de keukentafel.',
      created_at: '2026-03-09T09:00:00+01:00',
    },
  ]

  it('geeft de nieuwste eigen notitie, met wanneer je het zei', () => {
    const a = beantwoord('Waar heb ik mijn sleutels gelegd?', { ...kennis, onthouden: eigen }, NU)
    expect(a.titel).toBe('Mijn sleutels liggen in de inkomhal.')
    expect(a.regels[0]).toBe('Dat zei je vandaag om 10:14.')
    expect(a.bron).toBe('Onthouden door jou')
  })

  it('gaat voor op waar iets normaal ligt, maar noemt dat erbij', () => {
    const bril = [{ ...eigen[0], body: 'Mijn bril ligt in de auto.' }]
    const a = beantwoord('Waar is mijn bril?', { ...kennis, onthouden: bril }, NU)
    expect(a.titel).toBe('Mijn bril ligt in de auto.')
    expect(a.regels[1]).toContain('nachtkastje')
  })

  it('somt op wat je liet onthouden', () => {
    const a = beantwoord('Wat moest ik onthouden?', { ...kennis, onthouden: eigen }, NU)
    expect(a.regels).toHaveLength(2)
    expect(a.regels[1]).toContain('gisteren')
  })
})

describe('radio', () => {
  const zenders = [
    { id: 'r2', name: 'Radio 2' },
    { id: 'nos', name: 'Nostalgie' },
  ]

  it('zet de favoriet op bij "zet de radio aan"', () => {
    const a = beantwoord('Zet de radio aan', { ...kennis, zenders }, NU)
    expect(a.radio).toEqual({ actie: 'aan', zenderId: 'r2' })
  })

  it('kiest de zender die je noemt', () => {
    const a = beantwoord('Zet Nostalgie op', { ...kennis, zenders }, NU)
    expect(a.radio).toEqual({ actie: 'aan', zenderId: 'nos' })
  })

  it('zet de radio uit', () => {
    expect(beantwoord('Radio uit', { ...kennis, zenders }, NU).radio?.actie).toBe('uit')
  })

  it('zegt eerlijk dat er nog geen zenders zijn', () => {
    const a = beantwoord('Zet de radio aan', kennis, NU)
    expect(a.radio).toBeUndefined()
    expect(a.titel).toContain('geen zenders')
  })
})
