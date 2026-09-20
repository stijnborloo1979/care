import { describe, expect, it } from 'vitest'
import { dateLine, greeting, hhmm, localDateKey, minutesBetween } from './time'

const TZ = 'Europe/Brussels'

describe('tijd in de tijdzone van het huishouden', () => {
  it('zet een moment om naar het lokale uur', () => {
    expect(hhmm(new Date('2026-03-10T07:30:00+01:00'), TZ)).toBe('07:30')
  })

  it('houdt rekening met zomertijd', () => {
    // Beide zijn 08:00 lokaal, maar met een ander UTC-verschil.
    expect(hhmm(new Date('2026-01-15T08:00:00+01:00'), TZ)).toBe('08:00')
    expect(hhmm(new Date('2026-07-15T08:00:00+02:00'), TZ)).toBe('08:00')
  })

  it('geeft dezelfde dagsleutel voor alles binnen die lokale dag', () => {
    expect(localDateKey(new Date('2026-03-10T23:30:00+01:00'), TZ)).toBe('2026-03-10')
    // Middernacht UTC is in Brussel al de volgende dag.
    expect(localDateKey(new Date('2026-03-10T23:30:00Z'), TZ)).toBe('2026-03-11')
  })

  it('schrijft de datum uit in het Nederlands, met hoofdletter', () => {
    expect(dateLine(new Date('2026-03-10T09:00:00+01:00'), TZ)).toMatch(/^Dinsdag 10 maart$/)
  })

  it('groet naargelang het uur', () => {
    expect(greeting(new Date('2026-03-10T08:00:00+01:00'), TZ)).toBe('Goedemorgen')
    expect(greeting(new Date('2026-03-10T14:00:00+01:00'), TZ)).toBe('Goedemiddag')
    expect(greeting(new Date('2026-03-10T20:00:00+01:00'), TZ)).toBe('Goedenavond')
    expect(greeting(new Date('2026-03-10T03:00:00+01:00'), TZ)).toBe('Goedenacht')
  })

  it('telt minuten met een teken', () => {
    const a = new Date('2026-03-10T12:00:00Z')
    expect(minutesBetween(a, new Date('2026-03-10T12:30:00Z'))).toBe(30)
    expect(minutesBetween(a, new Date('2026-03-10T11:45:00Z'))).toBe(-15)
  })
})
