import { describe, expect, it } from 'vitest'
import { kiesBereikbaar } from './Help'

/**
 * Op het Help-scherm staan hoogstens drie namen, en wie daar terechtkomt is
 * in de war of ongerust. Elke naam die niets oplevert, neemt de plaats in van
 * iemand die wél te bereiken is — dat is het soort fout dat pas opvalt op het
 * moment dat het ertoe doet.
 *
 * Wat er misging: de verpleegster stond er met alleen een telefoonnummer, op
 * een tablet die niet kan bellen. Een kaart die eruitziet als een knop en
 * niets doet.
 */
const mensen = [
  { id: '1', kind: 'family', name: 'Els', phone: null, profile_id: 'p1' },
  { id: '2', kind: 'family', name: 'Jan', phone: '0475112233', profile_id: null },
  { id: '3', kind: 'caregiver', name: 'Sandra', phone: '0478636064', profile_id: null },
  { id: '4', kind: 'doctor', name: 'Dr. Janssens', phone: '093334455', profile_id: null },
  { id: '5', kind: 'self', name: 'Maria', phone: null, profile_id: 'p5' },
  { id: '6', kind: 'neighbour', name: 'Buurman', phone: null, profile_id: null },
]

const namen = (uit: { name: string }[]) => uit.map((p) => p.name)

describe('kiesBereikbaar', () => {
  it('laat op een toestel dat niet kan bellen alleen familie staan', () => {
    expect(namen(kiesBereikbaar(mensen, false))).toEqual(['Els', 'Jan'])
  })

  it('zet familie vooraan, ook wanneer bellen wel kan', () => {
    expect(namen(kiesBereikbaar(mensen, true))).toEqual(['Els', 'Jan', 'Sandra'])
  })

  it('neemt familie zonder telefoonnummer mee — die vraagt om terugbellen', () => {
    const uit = kiesBereikbaar([mensen[0]], false)
    expect(namen(uit)).toEqual(['Els'])
  })

  it('laat iemand zonder nummer buiten wanneer hij geen familie is', () => {
    expect(namen(kiesBereikbaar([mensen[5]], true))).toEqual([])
  })

  it('toont de persoon nooit zichzelf', () => {
    for (const kan of [true, false]) {
      expect(namen(kiesBereikbaar(mensen, kan))).not.toContain('Maria')
    }
  })

  it('houdt het op drie', () => {
    const veel = Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      kind: 'family',
      name: `Kind ${i}`,
      phone: null,
      profile_id: `p${i}`,
    }))
    expect(kiesBereikbaar(veel, true)).toHaveLength(3)
  })

  it('geeft een lege lijst terug bij een leeg gezin', () => {
    expect(kiesBereikbaar([], true)).toEqual([])
    expect(kiesBereikbaar([], false)).toEqual([])
  })
})
