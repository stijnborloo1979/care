import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Opnames van verhalen en dagboek (migratie 56). Met 56: eerst het verhaal,
 * dan de opname in de bucket 'diary'. Zonder 56: zoals vroeger, eerst de
 * opname in 'messages' (map verhalen/), dan het verhaal.
 */

type Fout = { code?: string; message: string } | null
let insertFouten: Fout[]
let uploadFout: Fout
const log: string[] = []

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      insert: async (rij: { audio_path: string | null; audio_bucket?: string }) => {
        log.push(`insert ${rij.audio_bucket ?? '-'} ${rij.audio_path ?? '-'}`)
        return { error: insertFouten.shift() ?? null }
      },
      delete: () => ({
        eq: async () => {
          log.push('delete rij')
          return { error: null }
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (pad: string) => {
          log.push(`upload ${bucket} ${pad}`)
          return { error: uploadFout }
        },
        remove: async (paden: string[]) => {
          log.push(`remove ${bucket} ${paden.join(',')}`)
          return { error: null }
        },
      }),
    },
  },
}))

vi.mock('../lib/storage', () => ({
  signedUrl: async (bucket: string, path: string) => `https://link/${bucket}/${path}`,
}))

const blob = new Blob(['x'], { type: 'audio/webm' })
const basis = { householdId: 'hh', vraag: 'Vertel', blob, mimeType: 'audio/webm', delen: true }

beforeEach(() => {
  insertFouten = []
  uploadFout = null
  log.length = 0
})

describe('addStory met migratie 56', () => {
  it('eerst het verhaal, dan de opname in diary, rechtstreeks in de map van het huishouden', async () => {
    const { addStory } = await import('./stories')
    await addStory(basis)
    expect(log).toHaveLength(2)
    expect(log[0]).toMatch(/^insert diary hh\/[0-9a-f-]+\.webm$/)
    expect(log[1]).toBe(log[0].replace('insert diary', 'upload diary'))
  })

  it('mislukt de upload, dan verdwijnt het verhaal weer', async () => {
    const { addStory } = await import('./stories')
    uploadFout = { message: 'netwerk' }
    await expect(addStory(basis)).rejects.toBeTruthy()
    expect(log.at(-1)).toBe('delete rij')
  })

  it('een verhaal zonder opname raakt de opslag niet', async () => {
    const { addStory } = await import('./stories')
    await addStory({ householdId: 'hh', vraag: 'V', tekst: 'Alleen tekst', delen: true })
    expect(log).toEqual(['insert - -'])
  })
})

describe('addStory zonder migratie 56', () => {
  it('valt terug op messages/verhalen, opname eerst', async () => {
    const { addStory } = await import('./stories')
    insertFouten = [{ code: 'PGRST204', message: "Could not find the 'audio_bucket' column" }]
    await addStory(basis)
    expect(log[1]).toMatch(/^upload messages hh\/verhalen\/.+\.webm$/)
    expect(log[2]).toMatch(/^insert - hh\/verhalen\/.+\.webm$/)
  })

  it('een andere fout valt niet terug', async () => {
    const { addStory } = await import('./stories')
    insertFouten = [{ code: '42501', message: 'row-level security' }]
    await expect(addStory(basis)).rejects.toBeTruthy()
    expect(log).toHaveLength(1)
  })
})

describe('afspelen en wissen kiezen de juiste bucket', () => {
  it('bucketVan', async () => {
    const { bucketVan } = await import('./stories')
    expect(bucketVan({ audio_bucket: 'diary' })).toBe('diary')
    expect(bucketVan({ audio_bucket: 'messages' })).toBe('messages')
    expect(bucketVan({})).toBe('messages')
  })

  it('deleteStory wist in diary', async () => {
    const { deleteStory } = await import('./stories')
    await deleteStory({
      id: '1', household_id: 'hh', question: 'q', body: null, audio_path: 'hh/a.webm',
      audio_seconds: null, shared: true, created_at: '', audio_bucket: 'diary',
    })
    expect(log[0]).toBe('remove diary hh/a.webm')
  })
})
