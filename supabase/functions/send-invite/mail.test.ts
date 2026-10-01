import { beforeAll, describe, expect, it } from 'vitest'

let mod: typeof import('./index.ts')
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined }, serve: () => {} }
  mod = await import('./index.ts')
})

describe('uitnodigingsmails', () => {
  it('familie: zoals voorheen', () => {
    const m = mod.familieMail({ email: 'els@x.be', token: 'T1', expires_at: '2026-10-08T00:00:00Z', persoon: 'Maria', app: 'https://app' })
    expect(m.subject).toBe('Je bent uitgenodigd om mee te zorgen voor Maria')
    expect(m.html).toContain('https://app/uitnodiging?token=T1')
  })

  it('medewerker: link naar /zorg/uitnodiging en de rol in gewone taal', () => {
    const m = mod.medewerkerMail({
      email: 'tom@wzc.be', token: 'T2', expires_at: '2026-10-15T00:00:00Z',
      rol: 'caregiver', organisatie: 'WZC <De Linde>', app: 'https://app',
    })
    expect(m.to).toBe('tom@wzc.be')
    expect(m.subject).toBe('WZC <De Linde> nodigt je uit in LifeAngle Care')
    expect(m.html).toContain('https://app/zorg/uitnodiging?token=T2')
    expect(m.html).toContain('zorgmedewerker')
    expect(m.html).toContain('WZC &lt;De Linde&gt;')
    expect(m.html).not.toContain('<De Linde>')
  })
})
