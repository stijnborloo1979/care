import { beforeEach, describe, expect, it, vi } from 'vitest'

let antwoord: { data: unknown; error: unknown } = { data: null, error: null }
const aanroepen: { naam: string; args: unknown }[] = []
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: async (naam: string, args: unknown) => {
      aanroepen.push({ naam, args })
      return antwoord
    },
  },
}))

beforeEach(() => {
  antwoord = { data: null, error: null }
  aanroepen.length = 0
})

describe('uitnodigingen in de app (67)', () => {
  it('toont de open uitnodigingen', async () => {
    const { mijnUitnodigingen } = await import('./zorgApi')
    antwoord = { data: [{ id: 'i1', organisatie: 'WZC De Linde', rol: 'caregiver', verloopt: '2026-10-10' }], error: null }
    await expect(mijnUitnodigingen()).resolves.toHaveLength(1)
  })

  it('zonder migratie 67: gewoon geen uitnodigingen, geen fout', async () => {
    const { mijnUitnodigingen } = await import('./zorgApi')
    antwoord = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(mijnUitnodigingen()).resolves.toEqual([])
  })

  it('aanvaarden stuurt alleen het id, nooit een token', async () => {
    const { aanvaardInApp } = await import('./zorgApi')
    antwoord = { data: 'org-1', error: null }
    await expect(aanvaardInApp('i1')).resolves.toBe('org-1')
    expect(aanroepen[0]).toEqual({ naam: 'aanvaard_org_uitnodiging_id', args: { uitnodiging: 'i1' } })
  })

  it('een weigering van de database (ander e-mailadres) gaat door', async () => {
    const { aanvaardInApp } = await import('./zorgApi')
    antwoord = { data: null, error: { message: 'Deze uitnodiging is voor x@y. Log in met dat adres.' } }
    await expect(aanvaardInApp('i1')).rejects.toBeTruthy()
  })
})
