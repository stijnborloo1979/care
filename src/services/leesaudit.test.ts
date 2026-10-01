import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Documenten en opnames openen loopt via de database (55_leesaudit.sql),
 * zodat de familiebeheerder ziet wie wat opende. Zolang die migratie niet
 * gedraaid is, moet openen gewoon blijven werken zoals vroeger.
 */

let rpcAntwoord: { data: unknown; error: unknown } = { data: null, error: null }
const rpcOproepen: { naam: string; args: unknown }[] = []
const getekend: string[] = []

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: async (naam: string, args: unknown) => {
      rpcOproepen.push({ naam, args })
      return rpcAntwoord
    },
  },
}))

vi.mock('../lib/storage', () => ({
  signedUrl: async (bucket: string, path: string) => {
    getekend.push(`${bucket}/${path}`)
    return `https://link/${bucket}/${path}`
  },
}))

beforeEach(() => {
  rpcAntwoord = { data: null, error: null }
  rpcOproepen.length = 0
  getekend.length = 0
})

describe('openDocument', () => {
  it('vraagt het pad aan de database, die de inzage logt', async () => {
    const { openDocument } = await import('./documents')
    rpcAntwoord = { data: 'hh/identiteit/a.pdf', error: null }
    const url = await openDocument({ id: 'doc-1', storage_path: 'oud/pad.pdf' })
    expect(rpcOproepen).toEqual([{ naam: 'open_document', args: { doc: 'doc-1' } }])
    expect(getekend).toEqual(['documents/hh/identiteit/a.pdf'])
    expect(url).toContain('hh/identiteit/a.pdf')
  })

  it('valt terug op het bekende pad als de migratie er nog niet is', async () => {
    const { openDocument } = await import('./documents')
    rpcAntwoord = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    await openDocument({ id: 'doc-1', storage_path: 'oud/pad.pdf' })
    expect(getekend).toEqual(['documents/oud/pad.pdf'])
  })

  it('opent niets als de database weigert', async () => {
    const { openDocument } = await import('./documents')
    rpcAntwoord = { data: null, error: { code: '42501', message: 'Document niet gevonden' } }
    await expect(openDocument({ id: 'doc-1', storage_path: 'oud/pad.pdf' })).rejects.toBeTruthy()
    expect(getekend).toEqual([])
  })
})

describe('storyAudioUrl', () => {
  it('met een id: via de database', async () => {
    const { storyAudioUrl } = await import('./stories')
    rpcAntwoord = { data: 'verhalen/x.webm', error: null }
    await storyAudioUrl('verhalen/x.webm', 'v-1')
    expect(rpcOproepen).toEqual([{ naam: 'open_verhaal_opname', args: { verhaal: 'v-1' } }])
    expect(getekend).toEqual(['messages/verhalen/x.webm'])
  })

  it('zonder migratie: zoals vroeger', async () => {
    const { storyAudioUrl } = await import('./stories')
    rpcAntwoord = { data: null, error: { code: '42883', message: 'function does not exist' } }
    await storyAudioUrl('verhalen/x.webm', 'v-1')
    expect(getekend).toEqual(['messages/verhalen/x.webm'])
  })

  it('weigert de database, dan geen link', async () => {
    const { storyAudioUrl } = await import('./stories')
    rpcAntwoord = { data: null, error: { code: '42501', message: 'Verhaal niet gevonden' } }
    await expect(storyAudioUrl('verhalen/x.webm', 'v-1')).rejects.toBeTruthy()
    expect(getekend).toEqual([])
  })
})
