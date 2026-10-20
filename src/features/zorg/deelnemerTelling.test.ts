import { describe, expect, it } from 'vitest'
import { telDeelnemers } from './deelnemerTelling'

describe('telDeelnemers', () => {
  it('telt ingeschreven en aanwezig per activiteit', () => {
    expect(
      telDeelnemers([
        { activity_id: 'a', status: 'ingeschreven' },
        { activity_id: 'a', status: 'aanwezig' },
        { activity_id: 'b', status: 'ingeschreven' },
      ]),
    ).toEqual({ a: 2, b: 1 })
  })

  it('telt afwezige bewoners niet mee', () => {
    expect(telDeelnemers([{ activity_id: 'a', status: 'afwezig' }])).toEqual({})
  })

  it('geeft een lege telling als er niemand is', () => {
    expect(telDeelnemers([])).toEqual({})
  })
})
