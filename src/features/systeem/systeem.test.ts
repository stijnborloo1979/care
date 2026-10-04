import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'x' } }) } }))
import { ontbrekend, systeemControle } from './systeem'

describe('systeemcontrole', () => {
  it('ontbrekende updates, oplopend', () => {
    expect(ontbrekend([
      { migratie: 44, onderdeel: 'Wie gaat er langs', aanwezig: false },
      { migratie: 1, onderdeel: 'Basis', aanwezig: true },
      { migratie: 25, onderdeel: 'Medicatiegeschiedenis', aanwezig: false },
    ]).map((c) => c.migratie)).toEqual([25, 44])
  })
  it('zonder 76: null, geen fout', async () => {
    await expect(systeemControle()).resolves.toBeNull()
  })
})
