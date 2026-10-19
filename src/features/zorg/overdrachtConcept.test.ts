import { describe, expect, it } from 'vitest'
import { conceptTekst, maakConcept, type Invoer } from './overdrachtConcept'

const basis = (over: Partial<Invoer> = {}): Invoer => ({
  sinds: '2026-10-19T06:00:00Z',
  notities: [],
  nieuweVerblijven: [],
  activiteiten: [],
  ...over,
})

describe('maakConcept', () => {
  it('geeft niets terug als er niets nieuws is', () => {
    expect(maakConcept(basis())).toEqual([])
  })

  it('neemt notities van vóór het venster niet mee', () => {
    const r = maakConcept(
      basis({
        notities: [
          { id: 'oud', body: 'oud nieuws', category: 'zorg', created_at: '2026-10-18T20:00:00Z', kamer: '101', vervangt: null },
        ],
      }),
    )
    expect(r).toEqual([])
  })

  it('laat een vervangen notitie weg', () => {
    const r = maakConcept(
      basis({
        notities: [
          { id: 'oud', body: 'eerste versie', category: 'zorg', created_at: '2026-10-19T07:00:00Z', kamer: '101', vervangt: null },
          { id: 'nieuw', body: 'gecorrigeerd', category: 'zorg', created_at: '2026-10-19T08:00:00Z', kamer: '101', vervangt: 'oud' },
        ],
      }),
    )
    expect(r.map((x) => x.bron.id)).toEqual(['nieuw'])
  })

  it('neemt de tekst van een notitie letterlijk over', () => {
    const body = 'Vandaag wat vermoeid, minder gegeten.'
    const r = maakConcept(
      basis({
        notities: [{ id: 'n1', body, category: 'maaltijd', created_at: '2026-10-19T08:30:00Z', kamer: '12', vervangt: null }],
      }),
    )
    expect(r[0].tekst).toContain(body)
    expect(r[0].tekst).toContain('Kamer 12')
  })

  it('toont tijden in Brussels-tijd', () => {
    // 08:30 UTC is 10:30 in Brussel (CEST, oktober)
    const r = maakConcept(
      basis({
        nieuweVerblijven: [{ id: 'v1', kamer: '7', started_at: '2026-10-19T08:30:00Z' }],
      }),
    )
    expect(r[0].tekst).toBe('Nieuw verblijf: kamer 7, sinds 10:30.')
  })

  it('neemt alleen geplande activiteiten mee', () => {
    const r = maakConcept(
      basis({
        activiteiten: [
          { id: 'a1', titel: 'Bingo', starts_at: '2026-10-19T12:00:00Z', plaats: 'Zaal', status: 'gepland' },
          { id: 'a2', titel: 'Kaarten', starts_at: '2026-10-19T13:00:00Z', plaats: null, status: 'geannuleerd' },
        ],
      }),
    )
    expect(r.map((x) => x.bron.id)).toEqual(['a1'])
  })

  it('heeft voor elke regel een bron die uit de invoer komt', () => {
    const r = maakConcept(
      basis({
        nieuweVerblijven: [{ id: 'v1', kamer: '7', started_at: '2026-10-19T08:00:00Z' }],
        activiteiten: [{ id: 'a1', titel: 'Bingo', starts_at: '2026-10-19T12:00:00Z', plaats: null, status: 'gepland' }],
        notities: [{ id: 'n1', body: 'x', category: 'zorg', created_at: '2026-10-19T09:00:00Z', kamer: '1', vervangt: null }],
      }),
    )
    const ids = new Set(['v1', 'a1', 'n1'])
    expect(r).toHaveLength(3)
    for (const regel of r) expect(ids.has(regel.bron.id)).toBe(true)
  })

  it('zet de tekst op een regel per bron', () => {
    const r = maakConcept(
      basis({
        nieuweVerblijven: [{ id: 'v1', kamer: '7', started_at: '2026-10-19T08:00:00Z' }],
        notities: [{ id: 'n1', body: 'rustig', category: 'stemming', created_at: '2026-10-19T09:00:00Z', kamer: '7', vervangt: null }],
      }),
    )
    expect(conceptTekst(r).split('\n')).toHaveLength(2)
  })
})
