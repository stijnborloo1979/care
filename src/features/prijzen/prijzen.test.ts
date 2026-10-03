import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'x' } }) } }))
import { careRaming, euro, maandenGratis, publiekePrijzen } from './prijzen'

describe('prijzen', () => {
  it('Belgische notatie, zonder ,00 bij een rond bedrag', () => {
    expect(euro(999).replace(/\s/g, ' ')).toBe('€ 9,99')
    expect(euro(15000).replace(/\s/g, ' ')).toBe('€ 150')
  })
  it('jaarabonnement: twee maanden gratis bij 9,99 / 99', () => {
    expect(maandenGratis({ prijs_maand_cent: 999, prijs_jaar_cent: 9900 })).toBe(2)
    expect(maandenGratis({ prijs_maand_cent: 0, prijs_jaar_cent: 0 })).toBe(0)
  })
  it('Care: per bewoner, met minimum', () => {
    expect(careRaming({ prijs_maand_cent: 600, minimum_maand_cent: 15000 }, 10)).toBe(15000)
    expect(careRaming({ prijs_maand_cent: 600, minimum_maand_cent: 15000 }, 40)).toBe(24000)
  })
  it('zonder migratie 77: null, geen fout', async () => {
    await expect(publiekePrijzen()).resolves.toBeNull()
  })
})
