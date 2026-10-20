import { describe, expect, it, afterEach } from 'vitest'
import { geenDienst, huidigeSpraakDienst, kiesSpraakDienst } from './spraakDienst'

afterEach(() => kiesSpraakDienst(geenDienst))

describe('spraakDienst', () => {
  it('start met geen dienst', () => {
    expect(huidigeSpraakDienst().naam).toBe('uit')
  })

  it('geen dienst beantwoordt niets', async () => {
    expect(await geenDienst.vraag('tijd_dienst', 'x')).toBeNull()
  })

  it('kiest een andere dienst', () => {
    kiesSpraakDienst({ naam: 'test', lokaal: true, vraag: async () => 'ok' })
    expect(huidigeSpraakDienst().naam).toBe('test')
  })
})
