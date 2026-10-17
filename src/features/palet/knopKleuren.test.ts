import { describe, expect, it } from 'vitest'
import {
  KNOP_IDS,
  KNOP_KLEUREN,
  contrast,
  isKnopId,
  isKnopKleur,
  schoneKnopKleuren,
} from './paletten'

describe('kleur per knop', () => {
  it('elke kleur haalt minstens 4,5:1 met witte tekst', () => {
    for (const k of KNOP_KLEUREN) {
      expect(contrast(k.hex, '#ffffff'), k.naam).toBeGreaterThanOrEqual(4.5)
    }
  }, 10_000)

  it('er zijn twaalf kleuren, zonder dubbele', () => {
    expect(KNOP_KLEUREN).toHaveLength(12)
    expect(new Set(KNOP_KLEUREN.map((k) => k.hex)).size).toBe(12)
  })

  it('kent de zeven knoppen van het scherm', () => {
    expect(KNOP_IDS).toEqual(['nu', 'vandaag', 'wie', 'memory', 'fotos', 'radio', 'help'])
    expect(isKnopId('nu')).toBe(true)
    expect(isKnopId('onbekend')).toBe(false)
  })

  it('accepteert alleen kleuren uit de lijst', () => {
    expect(isKnopKleur('#0f5d63')).toBe(true)
    expect(isKnopKleur('#ff0000')).toBe(false)
    expect(isKnopKleur(42)).toBe(false)
  })

  it('schoont ruwe invoer op', () => {
    const schoon = schoneKnopKleuren({
      nu: '#0f5d63',
      vandaag: '#ff0000',
      onbekend: '#0f5d63',
      wie: 3,
      help: '#1f1d1a',
    })
    expect(schoon).toEqual({ nu: '#0f5d63', help: '#1f1d1a' })
  })

  it('geeft een lege lijst bij ongeldige invoer', () => {
    expect(schoneKnopKleuren(null)).toEqual({})
    expect(schoneKnopKleuren('tekst')).toEqual({})
    expect(schoneKnopKleuren([])).toEqual({})
  })
})
