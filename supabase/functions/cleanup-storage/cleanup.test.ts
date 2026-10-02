import { beforeEach, describe, expect, it } from 'vitest'

/**
 * De nachtelijke opruiming van de bucket 'messages'. Opnames van verhalen
 * en het dagboek staan in dezelfde bucket, onder <huishouden>/verhalen/, en
 * mogen nooit gewist worden.
 */

const OUD = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
const NIEUW = new Date().toISOString()

type Item = { name: string; id: string | null; created_at?: string }
let boom: Record<string, Item[]>
let berichten: { audio_path: string | null; photo_path: string | null }[]
let verhalen: { audio_path: string }[]
let verhaalFout: { message: string } | null
let gewist: string[]
let handler: () => Promise<Response>

const map = (name: string): Item => ({ name, id: null })
const bestand = (name: string, created_at = OUD): Item => ({ name, id: name, created_at })

beforeEach(async () => {
  boom = {
    '': [map('hh1')],
    hh1: [map('family'), map('verhalen')],
    'hh1/family': [bestand('bericht.webm'), bestand('wees.webm'), bestand('vers.webm', NIEUW)],
    'hh1/verhalen': [bestand('verhaal.webm'), bestand('zonder-rij.webm')],
  }
  berichten = [{ audio_path: 'hh1/family/bericht.webm', photo_path: null }]
  verhalen = [{ audio_path: 'hh1/verhalen/verhaal.webm' }]
  verhaalFout = null
  gewist = []

  const g = globalThis as Record<string, unknown>
  g.Deno = {
    env: { get: () => 'x' },
    serve: (h: () => Promise<Response>) => {
      handler = h
    },
  }
  g.__maakClient = () => ({
    from: (tabel: string) => ({
      select: () =>
        tabel === 'message'
          ? Promise.resolve({ data: berichten, error: null })
          : { not: () => Promise.resolve({ data: verhaalFout ? null : verhalen, error: verhaalFout }) },
    }),
    storage: {
      from: () => ({
        list: async (prefix: string) => ({ data: boom[prefix] ?? [] }),
        remove: async (paden: string[]) => {
          gewist.push(...paden)
          return { error: null }
        },
      }),
    },
  })

  const { vi } = await import('vitest')
  vi.resetModules()
  await import('./index.ts')
})

describe('cleanup-storage', () => {
  it('wist alleen een oud bestand zonder bericht', async () => {
    const r = await handler()
    expect(await r.json()).toEqual({ gewist: 1 })
    expect(gewist).toEqual(['hh1/family/wees.webm'])
  })

  it('raakt nooit de map verhalen, ook niet een opname zonder rij', async () => {
    await handler()
    expect(gewist.some((p) => p.includes('/verhalen/'))).toBe(false)
  })

  it('wist niets als de verhalen niet op te halen zijn', async () => {
    verhaalFout = { message: 'kapot' }
    const r = await handler()
    expect(r.status).toBe(500)
    expect(gewist).toEqual([])
  })
})
