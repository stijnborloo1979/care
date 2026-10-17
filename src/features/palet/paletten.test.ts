import { describe, expect, it } from 'vitest'
import { PALETTEN, contrast, isPalet, paletVan } from './paletten'

/**
 * Elk palet moet leesbaar blijven. Een bewoner die slecht ziet kan een
 * slecht contrast niet zelf rechtzetten, en familie of het WZC ziet het
 * vaak pas op het tablet. Daarom wordt het hier gecontroleerd, niet
 * bij het kiezen.
 */

const WIT = '#ffffff'

describe('kleurpaletten', () => {
  it.each(PALETTEN.map((p) => [p.id, p] as const))('%s: witte tekst op het accent leesbaar', (_id, p) => {
    expect(contrast(p.accent, WIT)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PALETTEN.map((p) => [p.id, p] as const))('%s: accenttekst op het zachte vlak leesbaar', (_id, p) => {
    expect(contrast(p.accentInk, p.accentSoft)).toBeGreaterThanOrEqual(4.5)
  })

  it('heeft het standaardpalet als eerste', () => {
    expect(PALETTEN[0].id).toBe('standaard')
  })

  it('heeft geen dubbele ids', () => {
    const ids = PALETTEN.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('isPalet en paletVan', () => {
  it('herkent alleen bekende ids', () => {
    expect(isPalet('linde')).toBe(true)
    expect(isPalet('rood')).toBe(false)
    expect(isPalet(null)).toBe(false)
    expect(isPalet(42)).toBe(false)
  })

  it('valt terug op het standaardpalet bij een onbekend id', () => {
    expect(paletVan('onbekend').id).toBe('standaard')
    expect(paletVan(null).id).toBe('standaard')
  })
})

describe('contrast', () => {
  it('is 21 voor zwart op wit', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('is 1 voor dezelfde kleur', () => {
    expect(contrast('#123456', '#123456')).toBeCloseTo(1, 5)
  })
})
