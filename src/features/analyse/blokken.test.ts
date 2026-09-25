import { describe, expect, it } from 'vitest'
import { BLOKKEN, nietOpgenomen } from './blokken'

/**
 * Dit is de regel onderaan het verslag. Staat er te weinig, dan weet een
 * arts niet wat hij mist; staat er iets verkeerd, dan lijkt het alsof
 * familie iets achterhield wat er nooit was.
 */

const niksLeeg: Record<string, boolean> = {}

describe('nietOpgenomen', () => {
  it('noemt een blok met gegevens dat niet aangevinkt staat, weggelaten door familie', () => {
    const uit = nietOpgenomen(['medicatie'], niksLeeg)
    expect(uit.bewustWeg).toContain('Dagritme')
    expect(uit.bewustWeg).not.toContain('Medicatie')
    expect(uit.geenGegevens).toEqual([])
  })

  it('scheidt "weggelaten" van "niet gemeten"', () => {
    const uit = nietOpgenomen(['medicatie'], { nacht: true })
    expect(uit.geenGegevens).toEqual(["Activiteit 's nachts"])
    expect(uit.bewustWeg).not.toContain("Activiteit 's nachts")
  })

  it('rekent een leeg blok nooit als weggelaten, ook niet als het aangevinkt staat', () => {
    const uit = nietOpgenomen(['nacht'], { nacht: true })
    expect(uit.geenGegevens).toEqual(["Activiteit 's nachts"])
    expect(uit.bewustWeg).not.toContain("Activiteit 's nachts")
  })

  it('zegt niets wanneer alles meegaat', () => {
    const uit = nietOpgenomen(
      BLOKKEN.map((b) => b.id),
      niksLeeg,
    )
    expect(uit.bewustWeg).toEqual([])
    expect(uit.geenGegevens).toEqual([])
  })

  it('noemt elk blok precies één keer', () => {
    const uit = nietOpgenomen([], { nacht: true })
    const alles = [...uit.bewustWeg, ...uit.geenGegevens]
    expect(alles).toHaveLength(BLOKKEN.length)
    expect(new Set(alles).size).toBe(BLOKKEN.length)
  })
})

describe('BLOKKEN', () => {
  it('heeft unieke ids, want die worden bewaard in report_prefs', () => {
    const ids = BLOKKEN.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
