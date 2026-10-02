import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Oude opnames verhuizen van 'messages' naar 'diary'. Een nagebootste
 * Supabase in het geheugen: tabel life_story en twee buckets.
 */

type Rij = { id: string; household_id: string; audio_path: string | null; audio_bucket: string; created_at: string }
let rijen: Rij[]
let buckets: Record<string, Map<string, Blob>>
let bedervenUpload = false
let voorUpdate: (() => void) | null = null

const blob = (n: number) => new Blob([new Uint8Array(n)], { type: 'audio/webm' })

class Q {
  filters: ((r: Rij) => boolean)[] = []
  n = Infinity
  head = false
  constructor(private op: 'select' | 'update', private patch?: Partial<Rij>) {}
  select(_c?: string, opts?: { head?: boolean }) {
    if (opts?.head) this.head = true
    return this
  }
  eq(c: keyof Rij, v: unknown) {
    this.filters.push((r) => r[c] === v)
    return this
  }
  like(c: keyof Rij, p: string) {
    const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$')
    this.filters.push((r) => re.test(String(r[c] ?? '')))
    return this
  }
  not(c: keyof Rij) {
    this.filters.push((r) => r[c] != null)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.n = n
    return this
  }
  then(ok: (v: unknown) => void) {
    if (this.op === 'update' && voorUpdate) {
      voorUpdate()
      voorUpdate = null
    }
    const hits = rijen.filter((r) => this.filters.every((f) => f(r))).slice(0, this.n)
    if (this.op === 'update') hits.forEach((r) => Object.assign(r, this.patch))
    ok(this.head ? { count: hits.length, error: null } : { data: hits.map((r) => ({ ...r })), error: null })
  }
}

function bucket(naam: string) {
  const b = (buckets[naam] ??= new Map())
  return {
    download: async (p: string) => (b.has(p) ? { data: b.get(p)!, error: null } : { data: null, error: { message: 'Object not found' } }),
    upload: async (p: string, data: Blob, o: { upsert?: boolean }) => {
      if (b.has(p) && !o.upsert) return { error: { message: 'The resource already exists' } }
      b.set(p, bedervenUpload ? blob(1) : data)
      return { error: null }
    },
    remove: async (paden: string[]) => {
      paden.forEach((p) => b.delete(p))
      return { error: null }
    },
    list: async (prefix: string) => {
      const items = new Map<string, { name: string; id: string | null }>()
      for (const p of b.keys()) {
        const rest = prefix ? (p.startsWith(prefix + '/') ? p.slice(prefix.length + 1) : null) : p
        if (rest == null) continue
        const [eerste, ...meer] = rest.split('/')
        items.set(eerste, { name: eerste, id: meer.length ? null : eerste })
      }
      return { data: [...items.values()] }
    },
  }
}

let handler: (req: Request) => Promise<Response>
const SLEUTEL = 'service-sleutel'

async function roep(body: unknown, sleutel = SLEUTEL) {
  const r = await handler(
    new Request('http://x', { method: 'POST', headers: { Authorization: `Bearer ${sleutel}` }, body: JSON.stringify(body) }),
  )
  return { status: r.status, body: await r.json() }
}

beforeEach(async () => {
  rijen = [
    { id: 'a', household_id: 'hh1', audio_path: 'hh1/verhalen/a.webm', audio_bucket: 'messages', created_at: '1' },
    { id: 'b', household_id: 'hh1', audio_path: 'hh1/verhalen/b.webm', audio_bucket: 'messages', created_at: '2' },
    { id: 'c', household_id: 'hh2', audio_path: 'hh2/verhalen/c.webm', audio_bucket: 'messages', created_at: '3' },
    { id: 'd', household_id: 'hh2', audio_path: 'hh2/d.webm', audio_bucket: 'diary', created_at: '4' },
  ]
  buckets = {
    messages: new Map([
      ['hh1/verhalen/a.webm', blob(100)],
      ['hh1/verhalen/b.webm', blob(200)],
      // c ontbreekt in de opslag
      ['hh1/family/bericht.webm', blob(50)],
    ]),
    diary: new Map([['hh2/d.webm', blob(10)]]),
  }
  bedervenUpload = false
  voorUpdate = null

  const g = globalThis as Record<string, unknown>
  g.Deno = {
    env: { get: (k: string) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? SLEUTEL : 'x') },
    serve: (h: typeof handler) => {
      handler = h
    },
  }
  g.__maakClient = () => ({
    from: () => ({
      select: (c?: string, o?: { head?: boolean }) => new Q('select').select(c, o),
      update: (p: Partial<Rij>) => new Q('update', p),
    }),
    storage: { from: bucket },
  })
  vi.resetModules()
  await import('./index.ts')
})

describe('verhuis-opnames', () => {
  it('weigert zonder service role', async () => {
    const { status } = await roep({}, 'gebruikerstoken')
    expect(status).toBe(403)
    expect(rijen[0].audio_bucket).toBe('messages')
  })

  it('proef: verandert niets', async () => {
    const { body } = await roep({})
    expect(body.modus).toBe('proef')
    expect(body.resultaten.map((r: { uitkomst: string }) => r.uitkomst)).toEqual(['zou_verhuizen', 'zou_verhuizen', 'ontbreekt'])
    expect(buckets.diary.size).toBe(1)
    expect(rijen.filter((r) => r.audio_bucket === 'diary')).toHaveLength(1)
  })

  it('uitvoeren: kopie, verhaal wijst naar diary, oud bestand blijft', async () => {
    const { body } = await roep({ uitvoeren: true })
    expect(body.resultaten.map((r: { uitkomst: string }) => r.uitkomst)).toEqual(['verhuisd', 'verhuisd', 'ontbreekt'])
    expect(rijen.find((r) => r.id === 'a')).toMatchObject({ audio_bucket: 'diary', audio_path: 'hh1/a.webm' })
    expect(buckets.diary.get('hh1/b.webm')?.size).toBe(200)
    expect(buckets.messages.has('hh1/verhalen/a.webm')).toBe(true)
    expect(rijen.find((r) => r.id === 'c')).toMatchObject({ audio_bucket: 'messages', audio_path: 'hh2/verhalen/c.webm' })
    expect(body.nog_te_doen).toBe(1)
  })

  it('een kopie die niet klopt: het verhaal blijft naar de oude plek wijzen', async () => {
    bedervenUpload = true
    const { body } = await roep({ uitvoeren: true })
    expect(body.resultaten[0]).toMatchObject({ uitkomst: 'mislukt', reden: 'kopie klopt niet' })
    expect(rijen.find((r) => r.id === 'a')?.audio_bucket).toBe('messages')
  })

  it('een verhaal dat intussen veranderde, wordt niet overschreven', async () => {
    voorUpdate = () => {
      rijen[0].audio_path = 'hh1/verhalen/nieuw.webm'
    }
    const { body } = await roep({ uitvoeren: true, aantal: 1 })
    expect(body.resultaten[0].uitkomst).toBe('mislukt')
    expect(rijen[0]).toMatchObject({ audio_bucket: 'messages', audio_path: 'hh1/verhalen/nieuw.webm' })
  })

  it('opnieuw na een onderbreking: een bestaande, juiste kopie volstaat', async () => {
    buckets.diary.set('hh1/a.webm', blob(100))
    const { body } = await roep({ uitvoeren: true, aantal: 1 })
    expect(body.resultaten[0].uitkomst).toBe('verhuisd')
  })

  it('opruimen: proef, dan alleen verhuisde oude bestanden wissen', async () => {
    await roep({ uitvoeren: true })
    rijen.push({ id: 'e', household_id: 'hh1', audio_path: 'hh1/verhalen/e.webm', audio_bucket: 'messages', created_at: '5' })
    buckets.messages.set('hh1/verhalen/e.webm', blob(5))

    const proef = await roep({ opruimen: true })
    const per = Object.fromEntries(proef.body.resultaten.map((r: { pad: string; uitkomst: string }) => [r.pad, r.uitkomst]))
    expect(per).toEqual({
      'hh1/verhalen/a.webm': 'zou_wissen',
      'hh1/verhalen/b.webm': 'zou_wissen',
      'hh1/verhalen/e.webm': 'blijft',
    })
    expect(buckets.messages.size).toBe(4)

    await roep({ opruimen: true, uitvoeren: true })
    expect([...buckets.messages.keys()].sort()).toEqual(['hh1/family/bericht.webm', 'hh1/verhalen/e.webm'])
  })
})

describe('hulpfuncties', () => {
  it('nieuwPad', async () => {
    const { nieuwPad } = await import('./index.ts')
    expect(nieuwPad('hh/verhalen/x.webm')).toBe('hh/x.webm')
    expect(nieuwPad('hh/family/x.webm')).toBeNull()
    expect(nieuwPad('hh/verhalen/sub/x.webm')).toBeNull()
  })

  it('isServiceRole', async () => {
    const { isServiceRole } = await import('./index.ts')
    const jwt = (rol: string) => `x.${btoa(JSON.stringify({ role: rol })).replace(/=+$/, '')}.y`
    expect(isServiceRole(`Bearer ${jwt('service_role')}`, 'k')).toBe(true)
    expect(isServiceRole(`Bearer ${jwt('authenticated')}`, 'k')).toBe(false)
    expect(isServiceRole('Bearer k', 'k')).toBe(true)
    expect(isServiceRole(null, 'k')).toBe(false)
  })
})
