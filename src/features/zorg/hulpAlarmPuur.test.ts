import { describe, expect, it } from 'vitest'
import { herhaling, hoeLang, ietsNieuws, waar } from './hulpAlarmPuur'
import type { HulpAlarm } from './zorgApi'

const nu = new Date('2026-10-22T10:00:00Z')
const alarm = (id: string, herhalingen = 0): HulpAlarm => ({
  id,
  household_id: 'hh',
  naam: 'Maria',
  kamer: '12',
  afdeling: 'Beuk',
  herhalingen,
  created_at: '2026-10-22T09:57:00Z',
  laatst_at: '2026-10-22T09:59:00Z',
})

describe('hulpvraag aan de afdeling', () => {
  it('zegt waar het is, met wat er bekend is', () => {
    expect(waar({ kamer: '12', afdeling: 'Beuk' })).toBe('kamer 12 · Beuk')
    expect(waar({ kamer: null, afdeling: 'Beuk' })).toBe('Beuk')
    expect(waar({ kamer: null, afdeling: null })).toBe('')
  })

  it('telt vanaf de eerste vraag: zo lang wacht ze al', () => {
    expect(hoeLang('2026-10-22T09:59:40Z', nu)).toBe('net nu')
    expect(hoeLang('2026-10-22T09:57:00Z', nu)).toBe('3 min geleden')
    expect(hoeLang('2026-10-22T08:55:00Z', nu)).toBe('1 u 5 min geleden')
    expect(hoeLang('2026-10-22T08:00:00Z', nu)).toBe('2 u geleden')
    // een klok die achterloopt geeft geen negatieve tijd
    expect(hoeLang('2026-10-22T10:05:00Z', nu)).toBe('net nu')
  })

  it('toont een herhaling pas vanaf de tweede keer', () => {
    expect(herhaling(0)).toBeNull()
    expect(herhaling(1)).toBe('2e keer gevraagd')
  })

  it('geeft alleen een signaal bij iets nieuws', () => {
    expect(ietsNieuws(undefined, [alarm('a')])).toBe(false) // eerste keer laden: het blok volstaat
    expect(ietsNieuws([], [alarm('a')])).toBe(true)
    expect(ietsNieuws([alarm('a')], [alarm('a')])).toBe(false)
    expect(ietsNieuws([alarm('a')], [alarm('a', 1)])).toBe(true) // opnieuw gedrukt
    expect(ietsNieuws([alarm('a'), alarm('b')], [alarm('a')])).toBe(false) // opgevolgd
  })
})
