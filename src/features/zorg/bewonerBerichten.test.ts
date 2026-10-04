import { beforeEach, describe, expect, it, vi } from 'vitest'

let rpcAntwoord: { data: unknown; error: unknown } = { data: null, error: null }
let fromAntwoord: { data: unknown; error: unknown } = { data: [], error: null }
const rpcs: { naam: string; args: unknown }[] = []
const keten = () => {
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) k[m] = () => k
  k.then = (r: (v: unknown) => unknown) => Promise.resolve(fromAntwoord).then(r)
  return k
}
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: async (naam: string, args: unknown) => {
      rpcs.push({ naam, args })
      return rpcAntwoord
    },
    from: () => keten(),
  },
}))

import { berichtenVan, draden, lopendVerblijf, ongezien, stuurAanZorgteam, type BewonerBericht } from './bewonerBerichten'

beforeEach(() => {
  rpcAntwoord = { data: null, error: null }
  fromAntwoord = { data: [], error: null }
  rpcs.length = 0
})

const b = (id: string, van: 'bewoner' | 'team', t: string, op: string | null = null): BewonerBericht => ({
  id, household_id: 'h', van, body: id, antwoord_op: op, gezien_at: null, created_at: t,
})

describe('draden', () => {
  it('vraag met zijn antwoorden, nieuwste vraag eerst', () => {
    const d = draden([b('v1', 'bewoner', '2026-10-02T08:00Z'), b('a1', 'team', '2026-10-02T09:00Z', 'v1'), b('v2', 'bewoner', '2026-10-02T10:00Z')])
    expect(d.map((x) => x.vraag.id)).toEqual(['v2', 'v1'])
    expect(d[1].antwoorden.map((a) => a.id)).toEqual(['a1'])
  })
})

describe('zonder migratie 68', () => {
  it('geen verblijf: de tablet toont niets', async () => {
    rpcAntwoord = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await expect(lopendVerblijf('h')).resolves.toBeNull()
  })
  it('geen tabel: lege lijst, geen fout', async () => {
    fromAntwoord = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    await expect(berichtenVan('h')).resolves.toEqual([])
  })
})

describe('ongezien', () => {
  it('telt per bewoner', async () => {
    fromAntwoord = { data: [{ household_id: 'a' }, { household_id: 'a' }, { household_id: 'b' }], error: null }
    await expect(ongezien()).resolves.toEqual({ a: 2, b: 1 })
  })
})

describe('stuurAanZorgteam', () => {
  it('stuurt de tekst zonder spaties rond', async () => {
    rpcAntwoord = { data: 'id-1', error: null }
    await stuurAanZorgteam('h', '  deken  ')
    expect(rpcs[0]).toEqual({ naam: 'bericht_aan_zorgteam', args: { hh: 'h', tekst: 'deken' } })
  })
})
