import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
import { maakAccess, mag } from './useAccess'
import { NAV, zichtbareNav } from '../../app/navigatie'

describe('rechten na herladen uit de bewaarde cache', () => {
  it('een JSON-kopie (zonder functie) geeft opnieuw een werkende can', () => {
    const uitCache = JSON.parse(JSON.stringify({ bekend: true, relations: ['family_admin'], permissions: ['agenda.read'], can: () => true }))
    const a = maakAccess(uitCache)
    expect(a.can('agenda.read')).toBe(true)
    expect(a.can('document.read')).toBe(false)
  })
  it('een object zonder can laat de navigatie niet vastlopen', () => {
    const kapot = { bekend: true } as unknown as { bekend: boolean; can: (p: string) => boolean }
    expect(() => zichtbareNav(NAV, kapot)).not.toThrow()
    expect(zichtbareNav(NAV, kapot)).toHaveLength(NAV.length)
    expect(mag(kapot, 'agenda.write', true)).toBe(true)
  })
  it('niets in de cache: onbekend, terugval', () => {
    expect(maakAccess(undefined).bekend).toBe(false)
    expect(mag(maakAccess(null), 'x', false)).toBe(false)
  })
})
