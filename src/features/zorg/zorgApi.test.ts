import { describe, expect, it } from 'vitest'
import { dienstDatum, huidigeDienst } from './zorgApi'

describe('dienst', () => {
  it('vroeg, laat en nacht', () => {
    expect(huidigeDienst(new Date(2026, 9, 1, 7, 0))).toBe('vroeg')
    expect(huidigeDienst(new Date(2026, 9, 1, 14, 59))).toBe('vroeg')
    expect(huidigeDienst(new Date(2026, 9, 1, 15, 0))).toBe('laat')
    expect(huidigeDienst(new Date(2026, 9, 1, 22, 0))).toBe('nacht')
    expect(huidigeDienst(new Date(2026, 9, 2, 3, 0))).toBe('nacht')
  })

  it('een nacht na middernacht hoort bij de vorige dag', () => {
    expect(dienstDatum(new Date(2026, 9, 2, 3, 0))).toBe('2026-10-01')
    expect(dienstDatum(new Date(2026, 9, 2, 7, 0))).toBe('2026-10-02')
    expect(dienstDatum(new Date(2026, 0, 1, 2, 0))).toBe('2025-12-31')
  })
})
