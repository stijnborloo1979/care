import { beforeEach, describe, expect, it, vi } from 'vitest'

type Antw = { data: unknown; error: unknown }
let antwoorden: Antw[] = []
const rpcs: { naam: string; args: unknown }[] = []
const volgende = () => antwoorden.shift() ?? { data: null, error: null }
const keten = () => {
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'update', 'maybeSingle']) k[m] = () => k
  k.then = (r: (v: unknown) => unknown) => Promise.resolve(volgende()).then(r)
  return k
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: async (naam: string, args: unknown) => {
      rpcs.push({ naam, args })
      return volgende()
    },
    from: () => keten(),
    functions: { invoke: async () => volgende() },
  },
}))

import { afdelingen, alleAfdelingen, beeindigVerblijf, hernoemAfdeling, stuurUitnodigingOpnieuw, zetOrgGegevens } from './zorgApi'

beforeEach(() => {
  antwoorden = []
  rpcs.length = 0
})

describe('afdelingen (72)', () => {
  it('zonder kolom archived_at: valt terug, alles actief', async () => {
    antwoorden = [{ data: null, error: { code: '42703', message: 'column does not exist' } }, { data: [{ id: 'a', name: 'A' }], error: null }]
    await expect(alleAfdelingen('o')).resolves.toEqual([{ id: 'a', name: 'A', archived_at: null }])
  })
  it('gearchiveerde afdelingen zijn geen keuze', async () => {
    antwoorden = [{ data: [{ id: 'a', name: 'A', archived_at: null }, { id: 'b', name: 'B', archived_at: '2026-10-01' }], error: null }]
    await expect(afdelingen('o')).resolves.toEqual([{ id: 'a', name: 'A' }])
  })
  it('hernoemen zonder recht (0 rijen) is een fout, geen stille mislukking', async () => {
    antwoorden = [{ data: [], error: null }]
    await expect(hernoemAfdeling('a', 'X')).rejects.toThrow(/beheerder/)
  })
})

describe('organisatie', () => {
  it('0 rijen bijgewerkt: duidelijke fout', async () => {
    antwoorden = [{ data: [], error: null }]
    await expect(zetOrgGegevens('o', { name: 'X', contact_email: '', vat_number: '' })).rejects.toThrow(/beheerder/)
  })
})

describe('uitnodiging opnieuw (70)', () => {
  it('verlengt en mailt; een mislukte mail is geen fout', async () => {
    antwoorden = [{ data: '2026-10-16', error: null }, { data: null, error: { message: 'Resend weigert' } }]
    await expect(stuurUitnodigingOpnieuw('i1')).resolves.toEqual({ gemaild: false })
    expect(rpcs[0]).toEqual({ naam: 'verleng_uitnodiging', args: { uitnodiging: 'i1' } })
  })
})

describe('verblijf beëindigen (71)', () => {
  it('stuurt de reden mee', async () => {
    await beeindigVerblijf('hh', 'verhuisd')
    expect(rpcs[0]).toEqual({ naam: 'beeindig_verblijf', args: { hh: 'hh', reden: 'verhuisd' } })
  })
})
