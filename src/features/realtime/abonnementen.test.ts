import { describe, expect, it } from 'vitest'
import { ABONNEMENTEN } from './useRealtime'

/**
 * Wat hier misging was één ontbrekende regel: de tabel household stond er
 * niet bij, en die draagt zowel de instellingen als de indeling van het
 * startscherm. Familie zette het thema om en op de tablet gebeurde niets.
 *
 * Het filter is daarbij het addertje: overal heet de kolom household_id,
 * maar op household zelf heet ze id. Filteren op household_id zou daar
 * niets opleveren — geen fout, gewoon stilte, en dat is het vervelendste
 * soort.
 */
describe('abonnementen', () => {
  const kolom = (tabel: string) =>
    ABONNEMENTEN.find((a) => a.tabel === tabel)?.kolom ?? 'household_id'

  it('luistert op de instellingen en de indeling', () => {
    const huis = ABONNEMENTEN.find((a) => a.tabel === 'household')
    expect(huis).toBeDefined()
    expect(huis?.sleutels).toContain('prefs')
    expect(huis?.sleutels).toContain('indeling')
  })

  it('filtert household op id, niet op household_id', () => {
    expect(kolom('household')).toBe('id')
  })

  it('filtert al de rest wel op household_id', () => {
    for (const a of ABONNEMENTEN.filter((a) => a.tabel !== 'household')) {
      expect(kolom(a.tabel)).toBe('household_id')
    }
  })

  it('ververst de lijst van huishoudens zonder huishouden erachter', () => {
    // ['households', gebruikerId] — daar past geen householdId achter, dus
    // dat moet op naam alleen.
    expect(ABONNEMENTEN.find((a) => a.tabel === 'household')?.losseSleutels).toEqual([
      'households',
    ])
  })

  it('abonneert nergens twee keer op dezelfde tabel', () => {
    const tabellen = ABONNEMENTEN.map((a) => a.tabel)
    expect(new Set(tabellen).size).toBe(tabellen.length)
  })

  it('geeft elk abonnement iets om te verversen', () => {
    for (const a of ABONNEMENTEN) {
      expect((a.sleutels?.length ?? 0) + (a.losseSleutels?.length ?? 0)).toBeGreaterThan(0)
    }
  })
})
