import { describe, expect, it } from 'vitest'
import { antwoordDienst, antwoordOpenTaken } from './spraakAntwoord'

const taak = (titel: string, done: string | null) => ({ id: titel, title: titel, note: null, due_on: null, done_at: done, created_at: '' })

describe('antwoordOpenTaken', () => {
  it('noemt alleen de open taken', () => {
    const t = antwoordOpenTaken([taak('Verband', null), taak('Medicatie', '2026-10-19T08:00:00Z')])
    expect(t).toContain('1 open taken')
    expect(t).toContain('Verband')
    expect(t).not.toContain('Medicatie')
  })
  it('zegt het eerlijk als er niets open staat', () => {
    expect(antwoordOpenTaken([taak('Verband', '2026-10-19T08:00:00Z')])).toContain('geen open taken')
  })
})

describe('antwoordDienst', () => {
  it('noemt de dienst', () => {
    expect(antwoordDienst('nacht')).toContain('nachtdienst')
  })
})
