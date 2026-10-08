import { describe, expect, it } from 'vitest'
import { kiesNaam } from './mijnNaam'

describe('kiesNaam', () => {
  it('neemt wat iemand zelf bij Jouw naam zette', () => {
    expect(kiesNaam('Els', 'els.janssens@voorbeeld.be')).toBe('Els')
  })
  it('maakt anders een naam uit het e-mailadres', () => {
    expect(kiesNaam('', 'stijn.borloo@ricoh.be')).toBe('Stijn Borloo')
    expect(kiesNaam(null, 'stijn.borloo@ricoh.be')).toBe('Stijn Borloo')
  })
  it('een e-mailadres als profielnaam telt niet als naam', () => {
    expect(kiesNaam('stijn.borloo@ricoh.be', 'stijn.borloo@ricoh.be')).toBe('Stijn Borloo')
  })
  it('spaties rond de eigen naam weg', () => {
    expect(kiesNaam('  Mama  ', 'x@y.be')).toBe('Mama')
  })
})
