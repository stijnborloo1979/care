import { describe, expect, it } from 'vitest'
import { dagdeelVan, isNacht, omschrijving } from './dagdeel'

const TZ = 'Europe/Brussels'

describe('isNacht', () => {
  it('venster over middernacht', () => {
    expect(isNacht(22, 22, 7)).toBe(true)
    expect(isNacht(3, 22, 7)).toBe(true)
    expect(isNacht(7, 22, 7)).toBe(false)
    expect(isNacht(21, 22, 7)).toBe(false)
  })

  it('venster binnen één dag', () => {
    expect(isNacht(1, 0, 6)).toBe(true)
    expect(isNacht(6, 0, 6)).toBe(false)
  })

  it('gelijke grenzen betekent geen nacht', () => {
    expect(isNacht(3, 7, 7)).toBe(false)
  })
})

describe('dagdeelVan', () => {
  it('deelt de dag in vieren', () => {
    expect(dagdeelVan(5)).toBe('nacht')
    expect(dagdeelVan(6)).toBe('ochtend')
    expect(dagdeelVan(12)).toBe('middag')
    expect(dagdeelVan(18)).toBe('avond')
  })
})

describe('omschrijving', () => {
  it('zegt weekdag en dagdeel in één woord', () => {
    // Dinsdag 22 september 2026, 21u30 in Brussel (zomertijd, UTC+2).
    const d = new Date('2026-09-22T19:30:00Z')
    expect(omschrijving(d, TZ)).toEqual({ titel: 'Het is dinsdagavond', onder: '22 september' })
  })

  it('zegt na middernacht gewoon dat het nacht is', () => {
    const d = new Date('2026-09-23T01:00:00Z') // 03u00 woensdag
    expect(omschrijving(d, TZ)).toEqual({ titel: 'Het is nacht', onder: 'Woensdag 23 september' })
  })

  it('rekent in de tijdzone van het huishouden, ook in de winter', () => {
    const d = new Date('2026-12-01T06:30:00Z') // 07u30 dinsdag, UTC+1
    expect(omschrijving(d, TZ).titel).toBe('Het is dinsdagochtend')
  })
})
