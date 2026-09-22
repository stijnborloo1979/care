import { describe, expect, it } from 'vitest'
import { vraagVanVandaag } from './vragen'
import { kiesHerinnering } from '../memories/vandaagVroeger'

const LIJST = ['A', 'B', 'C', 'D']

describe('vraagVanVandaag', () => {
  it('geeft elke dag dezelfde vraag, ook na herladen', () => {
    expect(vraagVanVandaag('2026-09-24', new Set(), 0, LIJST)).toBe(
      vraagVanVandaag('2026-09-24', new Set(), 0, LIJST),
    )
  })

  it('geeft een andere vraag op een andere dag', () => {
    expect(vraagVanVandaag('2026-09-24', new Set(), 0, LIJST)).not.toBe(
      vraagVanVandaag('2026-09-25', new Set(), 0, LIJST),
    )
  })

  it('slaat beantwoorde vragen over', () => {
    const v = vraagVanVandaag('2026-09-24', new Set(['A', 'B', 'C']), 0, LIJST)
    expect(v).toBe('D')
  })

  it('geeft niets meer als alles beantwoord is', () => {
    expect(vraagVanVandaag('2026-09-24', new Set(LIJST), 0, LIJST)).toBeNull()
  })

  it('schuift door bij "andere vraag"', () => {
    const een = vraagVanVandaag('2026-09-24', new Set(), 0, LIJST)
    const twee = vraagVanVandaag('2026-09-24', new Set(), 1, LIJST)
    expect(twee).not.toBe(een)
  })
})

describe('kiesHerinnering', () => {
  const foto = (id: string, year: number | null, taken_on: string | null = null) => ({
    id,
    household_id: 'hh',
    year,
    taken_on,
    title: id,
    story: null,
    photo_path: null,
    created_at: '',
  })

  it('kiest een echte verjaardag als die er is', () => {
    const h = kiesHerinnering(
      [foto('a', 1993), foto('b', 1968, '1968-09-24'), foto('c', 2008)],
      '2026-09-24',
    )
    expect(h?.foto.id).toBe('b')
    expect(h?.verjaardag).toBe(true)
    expect(h?.jarenGeleden).toBe(58)
  })

  it('rekent uit hoeveel jaar geleden', () => {
    const h = kiesHerinnering([foto('a', 1993)], '2026-09-24')
    expect(h?.jarenGeleden).toBe(33)
    expect(h?.verjaardag).toBe(false)
  })

  it('blijft dezelfde de hele dag', () => {
    const f = [foto('a', 1993), foto('b', 1968), foto('c', 2008)]
    expect(kiesHerinnering(f, '2026-09-24')?.foto.id).toBe(kiesHerinnering(f, '2026-09-24')?.foto.id)
  })

  it('geeft niets zonder foto’s', () => {
    expect(kiesHerinnering([], '2026-09-24')).toBeNull()
  })
})
