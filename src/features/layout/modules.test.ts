import { describe, expect, it } from 'vitest'
import {
  MAX_TEGELS,
  MODULES,
  normaliseer,
  schuif,
  STANDAARD,
  magSchuiven,
  type Tegel,
} from './modules'

/**
 * Deze functie draait ook op het scherm van de persoon. Wat er hier
 * doorheen glipt, wordt daar een leeg of kapot scherm — en dat is precies
 * het scherm dat altijd hoort te werken.
 */

const t = (id: string, maat: 'vol' | 'half' = 'half'): Tegel => ({ id, maat })

describe('normaliseer', () => {
  it('laat een geldige indeling met rust', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('daarna'), t('radio')] })
    expect(uit.tegels).toEqual([t('nu', 'vol'), t('daarna'), t('radio')])
  })

  it('geeft de standaard terug bij rommel', () => {
    for (const rommel of [null, undefined, {}, [], 'nee', { tegels: 'nee' }]) {
      expect(normaliseer(rommel).tegels.length).toBeGreaterThan(0)
    }
  })

  it('gooit onbekende modules weg in plaats van ze te tonen', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('bestaat-niet'), t('radio')] })
    expect(uit.tegels.map((x) => x.id)).toEqual(['nu', 'radio'])
  })

  it('zet "Wat nu?" vooraan, ook als het ergens anders stond', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('radio'), t('daarna'), t('nu', 'vol')] })
    expect(uit.tegels[0].id).toBe('nu')
    expect(uit.tegels.map((x) => x.id)).toEqual(['nu', 'radio', 'daarna'])
  })

  it('voegt "Wat nu?" toe als het ontbreekt', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('radio')] })
    expect(uit.tegels[0]).toEqual(t('nu', 'vol'))
  })

  it('laat dezelfde module niet twee keer toe', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('radio'), t('radio')] })
    expect(uit.tegels.filter((x) => x.id === 'radio')).toHaveLength(1)
  })

  it('maakt een tegel die nooit half kan, vol', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('vandaag', 'half')] })
    expect(uit.tegels.find((x) => x.id === 'vandaag')?.maat).toBe('vol')
  })

  it('maakt bij grote tekst alle halve tegels vol', () => {
    const in_ = { versie: 1 as const, tegels: [t('nu', 'vol'), t('radio'), t('onthoud')] }
    expect(normaliseer(in_).tegels.every((x) => x.maat === 'half' || x.id === 'nu')).toBe(true)
    expect(normaliseer(in_, { groteTekst: true }).tegels.every((x) => x.maat === 'vol')).toBe(true)
  })

  it('kapt af op het maximum', () => {
    const teveel = MODULES.map((m) => t(m.id))
    expect(teveel.length).toBeGreaterThan(MAX_TEGELS)
    expect(normaliseer({ versie: 1, tegels: teveel }).tegels).toHaveLength(MAX_TEGELS)
  })

  it('houdt de vaste tegel ook als er afgekapt wordt', () => {
    const teveel = MODULES.filter((m) => !m.vast).map((m) => t(m.id))
    const uit = normaliseer({ versie: 1, tegels: teveel })
    expect(uit.tegels[0].id).toBe('nu')
    expect(uit.tegels).toHaveLength(MAX_TEGELS)
  })

  it('is stabiel: nog eens normaliseren verandert niets', () => {
    const een = normaliseer({ versie: 1, tegels: [t('radio'), t('vandaag', 'half'), t('nu')] })
    expect(normaliseer(een)).toEqual(een)
  })

  it('de standaardindeling komt er ongewijzigd doorheen', () => {
    expect(normaliseer(STANDAARD)).toEqual(STANDAARD)
  })
})

describe('schuiven', () => {
  const lijst = [t('nu', 'vol'), t('daarna'), t('radio'), t('onthoud')]

  it('verwisselt twee tegels', () => {
    expect(schuif(lijst, 2, -1).map((x) => x.id)).toEqual(['nu', 'radio', 'daarna', 'onthoud'])
    expect(schuif(lijst, 1, 1).map((x) => x.id)).toEqual(['nu', 'radio', 'daarna', 'onthoud'])
  })

  it('laat niets over de vaste tegel heen', () => {
    expect(magSchuiven(lijst, 1, -1)).toBe(false)
    expect(schuif(lijst, 1, -1)).toEqual(lijst)
  })

  it('laat de vaste tegel zelf niet zakken', () => {
    expect(magSchuiven(lijst, 0, 1)).toBe(false)
    expect(schuif(lijst, 0, 1)).toEqual(lijst)
  })

  it('loopt niet voorbij het einde', () => {
    expect(magSchuiven(lijst, 3, 1)).toBe(false)
    expect(schuif(lijst, 3, 1)).toEqual(lijst)
  })

  it('verandert de oorspronkelijke lijst niet', () => {
    const kopie = lijst.slice()
    schuif(lijst, 2, -1)
    expect(lijst).toEqual(kopie)
  })
})

describe('MODULES', () => {
  it('heeft unieke ids, want die worden bewaard', () => {
    const ids = MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('heeft precies één vaste module', () => {
    expect(MODULES.filter((m) => m.vast)).toHaveLength(1)
  })

  it('kent elke module uit de standaardindeling', () => {
    for (const x of STANDAARD.tegels) {
      expect(MODULES.some((m) => m.id === x.id)).toBe(true)
    }
  })
})
