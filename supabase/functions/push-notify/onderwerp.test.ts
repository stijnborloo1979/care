import { beforeAll, describe, expect, it } from 'vitest'

let mod: typeof import('./index.ts')
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined }, serve: () => {} }
  mod = await import('./index.ts')
})

describe('onderwerp van de mail', () => {
  it('noodtoegang is geen hulpvraag', () => {
    expect(mod.onderwerp({ body: 'Noodtoegang: Tine (WZC) kijkt 4 uur mee. Reden: val', level: 'alert', person_name: 'Maria' }))
      .toBe('Noodtoegang bij Maria')
  })
  it('de rest zoals voorheen', () => {
    expect(mod.onderwerp({ body: 'Maria vraagt hulp', level: 'alert', person_name: 'Maria' })).toBe('Maria heeft hulp nodig')
    expect(mod.onderwerp({ body: 'Medicatie niet bevestigd', level: 'warn', person_name: 'Maria' })).toBe('Bericht over Maria')
  })
})
