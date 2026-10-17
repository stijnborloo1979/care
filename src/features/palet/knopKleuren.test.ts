import { describe, expect, it } from 'vitest'
import {
  FOTO_LAAG,
  KNOP_IDS,
  KNOP_KLEUREN,
  contrast,
  isKnopId,
  isKnopKleur,
  schoneKnopFotos,
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

  it('het verloop over een foto houdt witte tekst leesbaar, ook bij een witte foto', () => {
    // Vanaf het midden van de tegel staat de tekst. Een volledig witte foto
    // onder de laag geeft daar het zwakst contrast: wat er overblijft, is grijs.
    const grijs = Math.round(255 * (1 - FOTO_LAAG.midden))
    const hex = grijs.toString(16).padStart(2, '0')
    expect(contrast(`#${hex}${hex}${hex}`, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('foto per knop', () => {
  it('laat alleen bekende knoppen met een nette padnaam door', () => {
    const schoon = schoneKnopFotos({
      nu: 'hh1/knoppen/nu/a.jpg',
      onbekend: 'hh1/knoppen/onbekend/a.jpg',
      wie: '/abs/pad.jpg',
      memory: 'hh1/../andere/a.jpg',
      help: 42,
      radio: '',
    })
    expect(schoon).toEqual({ nu: 'hh1/knoppen/nu/a.jpg' })
  })

  it('geeft een lege lijst bij ongeldige invoer', () => {
    expect(schoneKnopFotos(null)).toEqual({})
    expect(schoneKnopFotos('tekst')).toEqual({})
  })
})
