import { describe, expect, it } from 'vitest'
import { uitspraak } from './uitspraak'

describe('uitspraak', () => {
  it('leest "min." aan het eind van een zin als minus, niet als minister', () => {
    expect(uitspraak('Het volume staat op de knop met plus en min.', 'nl-BE')).toBe(
      'Het volume staat op de knop met plus en minus.',
    )
  })

  it('laat het punt staan als het er was', () => {
    expect(uitspraak('Plus en min. Klaar.', 'nl')).toBe('Plus en minus. Klaar.')
  })

  it('leest een hoeveelheid minuten als minuten', () => {
    expect(uitspraak('Wacht 10 min.', 'nl-BE')).toBe('Wacht 10 minuten.')
    expect(uitspraak('Wacht 5min', 'nl-BE')).toBe('Wacht 5minuten')
  })

  it('raakt woorden die alleen min bevatten niet aan', () => {
    expect(uitspraak('Minder suiker, minimaal één lepel.', 'nl-BE')).toBe(
      'Minder suiker, minimaal één lepel.',
    )
  })

  it('verandert niets buiten het Nederlands', () => {
    expect(uitspraak('plus en min.', 'fr-BE')).toBe('plus en min.')
    expect(uitspraak('plus and min.', 'en')).toBe('plus and min.')
  })
})
