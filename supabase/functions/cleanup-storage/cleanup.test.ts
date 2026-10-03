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
let fotoBoom: Record<string, Item[]>
let bezoeken: { photo_path: string }[] | null
let gewistFoto: string[]
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
  fotoBoom = {
    '': [map('hh1')],
    hh1: [map('bezoek'), map('photos')],
    'hh1/bezoek': [bestand('v1-a.jpg'), bestand('v2-wees.jpg'), bestand('v3-vers.jpg', NIEUW)],
    'hh1/photos': [bestand('herinnering.jpg')],
  }
  bezoeken = [{ photo_path: 'hh1/bezoek/v1-a.jpg' }]
  gewistFoto = []

  const g = globalThis as Record<string, unknown>
  g.Deno = {
    env: { get: () => 'x' },
    serve: (h: () => Promise<Response>) => {
      handler = h
    },
  }
  g.__maakClient = () => ({
    from: (tabel: string) => {
      const bron = (): { data: unknown[] | null; error: unknown } =>
        tabel === 'message'
          ? { data: berichten, error: null }
          : tabel === 'visit_log'
            ? bezoeken ? { data: bezoeken, error: null } : { data: null, error: { code: '42P01', message: 'geen tabel' } }
            : verhaalFout ? { data: null, error: verhaalFout } : { data: verhalen, error: null }
      const keten: Record<string, unknown> = {}
      for (const m of ['select', 'not', 'order']) keten[m] = () => keten
      keten.range = async (van: number, tot: number) => {
        const r = bron()
        return r.data ? { data: r.data.slice(van, tot + 1), error: null } : r
      }
      return keten
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: (bucket === 'memories' ? fotoBoom : boom)[prefix] ?? [] }),
        remove: async (paden: string[]) => {
          ;(bucket === 'memories' ? gewistFoto : gewist).push(...paden)
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
    expect(await r.json()).toEqual({ gewist: 1, bezoekfotos: 1 })
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

  it('ruimt alleen een oude bezoekfoto zonder bezoek op, niets anders in memories', async () => {
    await handler()
    expect(gewistFoto).toEqual(['hh1/bezoek/v2-wees.jpg'])
  })

  it('zonder tabel visit_log (74 niet gedraaid) wist het niets in memories', async () => {
    bezoeken = null
    const r = await handler()
    expect(gewistFoto).toEqual([])
    expect((await r.json()).bezoekfotos).toBe(0)
  })

  it('kent alle berichten, ook voorbij de eerste 1000 rijen', async () => {
    berichten = [
      ...Array.from({ length: 1500 }, (_, i) => ({ audio_path: `hh1/family/x${i}.webm`, photo_path: null })),
      { audio_path: 'hh1/family/wees.webm', photo_path: null },
    ]
    await handler()
    // wees.webm staat pas op rij 1501 en blijft; bericht.webm hoort nu bij niets.
    expect(gewist).toEqual(['hh1/family/bericht.webm'])
  })
})
