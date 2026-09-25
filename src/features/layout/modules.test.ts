import { describe, expect, it } from 'vitest'
import {
  MODULES,
  SJABLONEN,
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

// Ook met een id dat niet bestaat: de test moet juist kunnen nagaan wat er
// dan gebeurt, en dat is precies wat er uit een oude database kan komen.
const t = (id: string, maat: 'vol' | 'half' = 'half'): Tegel => ({ id, maat }) as Tegel

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
    const uit = normaliseer({ versie: 1, tegels: [t('radio', 'vol')] })
    expect(uit.tegels[0]).toEqual(t('nu', 'vol'))
  })

  it('geeft een toegevoegde "Wat nu?" dezelfde maat als de rest', () => {
    // In een indeling die helemaal uit halve tegels bestaat, zou één
    // vol-brede kaart de kolommen doormidden knippen.
    const uit = normaliseer({ versie: 1, tegels: [t('radio'), t('onthoud')] })
    expect(uit.tegels[0]).toEqual(t('nu', 'half'))
  })

  it('laat dezelfde module niet twee keer toe', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('radio'), t('radio')] })
    expect(uit.tegels.filter((x) => x.id === 'radio')).toHaveLength(1)
  })

  it('maakt een tegel die nooit half kan, vol', () => {
    const uit = normaliseer({ versie: 1, tegels: [t('nu', 'vol'), t('knoppen', 'half')] })
    expect(uit.tegels.find((x) => x.id === 'knoppen')?.maat).toBe('vol')
  })

  it('maakt bij grote tekst alle halve tegels vol', () => {
    const in_ = { versie: 1 as const, tegels: [t('nu', 'vol'), t('radio'), t('onthoud')] }
    expect(normaliseer(in_).tegels.every((x) => x.maat === 'half' || x.id === 'nu')).toBe(true)
    expect(normaliseer(in_, { groteTekst: true }).tegels.every((x) => x.maat === 'vol')).toBe(true)
  })

  it('kapt niets af: er is geen maximum meer', () => {
    const alles = MODULES.map((m) => t(m.id))
    expect(normaliseer({ versie: 1, tegels: alles }).tegels).toHaveLength(MODULES.length)
  })

  it('voegt de vaste tegel toe, ook als alle andere er al staan', () => {
    const zonderVaste = MODULES.filter((m) => !m.vast).map((m) => t(m.id))
    const uit = normaliseer({ versie: 1, tegels: zonderVaste })
    expect(uit.tegels[0].id).toBe('nu')
    expect(uit.tegels).toHaveLength(MODULES.length)
  })

  it('kan nooit meer tegels opleveren dan er modules zijn', () => {
    // De natuurlijke grens: dezelfde module twee keer bestaat niet.
    const veel = [...MODULES, ...MODULES, ...MODULES].map((m) => t(m.id))
    expect(normaliseer({ versie: 1, tegels: veel }).tegels).toHaveLength(MODULES.length)
  })

  it('is stabiel: nog eens normaliseren verandert niets', () => {
    const een = normaliseer({ versie: 1, tegels: [t('radio'), t('vandaag', 'half'), t('nu')] })
    expect(normaliseer(een)).toEqual(een)
  })

  it('de standaardindeling komt er ongewijzigd doorheen', () => {
    expect(normaliseer(STANDAARD)).toEqual(STANDAARD)
  })

  it('zet in de standaardindeling de halve tegels twee aan twee', () => {
    // Anders blijft er op een tablet een halve kolom leeg naast een tegel.
    const rij: string[] = []
    let kolom = 0
    for (const x of STANDAARD.tegels) {
      if (x.maat === 'vol') {
        if (kolom === 1) rij.push('gat')
        kolom = 0
      } else {
        kolom = kolom === 1 ? 0 : 1
      }
    }
    if (kolom === 1) rij.push('gat')
    expect(rij).toEqual([])
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

describe('sjablonen', () => {
  it('gebruiken alleen modules die bestaan', () => {
    for (const sj of SJABLONEN) {
      for (const x of sj.tegels) {
        expect(MODULES.some((m) => m.id === x.id)).toBe(true)
      }
    }
  })

  it('komen ongewijzigd door normaliseer — anders springt het scherm meteen terug', () => {
    for (const sj of SJABLONEN) {
      expect(normaliseer({ versie: 1, tegels: sj.tegels }).tegels).toEqual(sj.tegels)
    }
  })

  it('beginnen allemaal met "Wat nu?"', () => {
    for (const sj of SJABLONEN) {
      expect(sj.tegels[0].id).toBe('nu')
    }
  })

  it('bevatten geen module twee keer', () => {
    for (const sj of SJABLONEN) {
      const ids = sj.tegels.map((x) => x.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('hebben unieke ids en namen', () => {
    expect(new Set(SJABLONEN.map((s) => s.id)).size).toBe(SJABLONEN.length)
    expect(new Set(SJABLONEN.map((s) => s.naam)).size).toBe(SJABLONEN.length)
  })

  it('zetten in "Twee kolommen" alles half behalve wat dat niet kan', () => {
    const tk = SJABLONEN.find((s) => s.id === 'twee-kolommen')!
    for (const x of tk.tegels) {
      const def = MODULES.find((m) => m.id === x.id)!
      expect(x.maat).toBe(def.altijdVol ? 'vol' : 'half')
    }
  })
})
