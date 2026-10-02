import { beforeEach, describe, expect, it, vi } from 'vitest'

let antwoord: { data: unknown; error: unknown } = { data: null, error: null }
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: async () => antwoord } }))

beforeEach(() => {
  antwoord = { data: null, error: null }
})

describe('koppelMetWzc', () => {
  it('geeft de naam terug bij een juiste code', async () => {
    const { koppelMetWzc } = await import('./zorgApi')
    antwoord = { data: 'WZC De Linde', error: null }
    await expect(koppelMetWzc('hh', 'ABCD2345')).resolves.toBe('WZC De Linde')
  })

  it('een onbekende code (null, vanaf 65) wordt een duidelijke fout', async () => {
    const { koppelMetWzc, ONBEKENDE_CODE } = await import('./zorgApi')
    await expect(koppelMetWzc('hh', 'FOUT')).rejects.toThrow(ONBEKENDE_CODE)
  })

  it('een fout van de database gaat door (te veel pogingen)', async () => {
    const { koppelMetWzc } = await import('./zorgApi')
    antwoord = { data: null, error: { message: 'Te veel pogingen. Probeer het over een uur opnieuw.' } }
    await expect(koppelMetWzc('hh', 'X')).rejects.toBeTruthy()
  })
})
