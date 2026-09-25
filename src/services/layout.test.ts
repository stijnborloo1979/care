import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Wat er gebeurt als 27_layout.sql nog niet gedraaid is.
 *
 * PostgREST geeft dan 42703 op de kolom home_layout. Dat vulde de console
 * met 400's — elk scherm opnieuw, en react-query probeerde het elke keer
 * nog twee keer. Het scherm van de persoon hoort intussen gewoon te
 * werken, op de standaardindeling, en de app hoort na één keer te weten
 * dat het geen zin heeft.
 */

let antwoord: { data: unknown; error: unknown } = { data: null, error: null }
let aantalVragen = 0

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            aantalVragen++
            return antwoord
          },
        }),
      }),
    }),
    rpc: async () => antwoord,
  },
}))

async function vers() {
  vi.resetModules()
  aantalVragen = 0
  return await import('./layout')
}

beforeEach(() => {
  antwoord = { data: null, error: null }
})

const ONTBREEKT = {
  data: null,
  error: { code: '42703', message: 'column household.home_layout does not exist' },
}

describe('getIndeling zonder de migratie', () => {
  it('geeft de standaardindeling in plaats van een fout', async () => {
    const { getIndeling } = await vers()
    antwoord = ONTBREEKT
    const uit = await getIndeling('hh')
    expect(uit.tegels.length).toBeGreaterThan(0)
    expect(uit.tegels[0].id).toBe('nu')
  })

  it('vraagt het daarna niet meer — anders loopt de console vol', async () => {
    const { getIndeling } = await vers()
    antwoord = ONTBREEKT
    await getIndeling('hh')
    await getIndeling('hh')
    await getIndeling('hh')
    expect(aantalVragen).toBe(1)
  })

  it('zegt in de editor wat eraan scheelt', async () => {
    const { getIndeling, indelingKolomOntbreekt } = await vers()
    expect(indelingKolomOntbreekt()).toBe(false)
    antwoord = ONTBREEKT
    await getIndeling('hh')
    expect(indelingKolomOntbreekt()).toBe(true)
  })

  it('geeft bij bewaren een uitleg en geen databasefout', async () => {
    const { setIndeling } = await vers()
    antwoord = { data: null, error: { code: '42883', message: 'function does not exist' } }
    await expect(setIndeling('hh', { versie: 1, tegels: [] })).rejects.toThrow(/27_layout\.sql/)
  })
})

describe('getIndeling met de migratie', () => {
  it('leest een bewaarde indeling', async () => {
    const { getIndeling } = await vers()
    antwoord = {
      data: { home_layout: { versie: 1, tegels: [{ id: 'nu', maat: 'vol' }, { id: 'radio', maat: 'half' }] } },
      error: null,
    }
    const uit = await getIndeling('hh')
    expect(uit.tegels.map((t) => t.id)).toEqual(['nu', 'radio'])
  })

  it('geeft de standaard als er nog niets ingesteld is', async () => {
    const { getIndeling } = await vers()
    antwoord = { data: { home_layout: {} }, error: null }
    const uit = await getIndeling('hh')
    expect(uit.tegels.length).toBeGreaterThan(1)
  })

  it('laat een echte fout wel door', async () => {
    const { getIndeling } = await vers()
    antwoord = { data: null, error: { code: '42501', message: 'permission denied' } }
    await expect(getIndeling('hh')).rejects.toBeTruthy()
  })
})
