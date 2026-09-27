import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Waarom dit bestaat.
 *
 * Elke ondertekende link is uniek. Vroeg de app er bij elke keer tonen een
 * nieuwe op, dan zag de browser telkens een ander adres en haalde hij de foto
 * opnieuw op — ook al stond diezelfde foto al in zijn cache. Op de tablet
 * betekende dat wachten bij elk terugkeren naar het scherm, met een emoji op
 * de plaats van de foto.
 *
 * Deze testen leggen de twee eigenschappen vast waar het om draait: dezelfde
 * foto geeft dezelfde link, en tien tegels tegelijk vragen niet tien keer
 * hetzelfde op.
 */

const maakLink = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, seconds: number) => {
          maakLink(path, seconds)
          // Elke aanroep een ander adres, net als in het echt.
          return { data: { signedUrl: `https://opslag/${path}?t=${maakLink.mock.calls.length}` }, error: null }
        },
      }),
    },
  },
}))

describe('signedUrlCached', () => {
  beforeEach(() => {
    maakLink.mockClear()
    vi.resetModules()
  })

  it('geeft twee keer dezelfde link voor dezelfde foto', async () => {
    const { signedUrlCached } = await import('./storage')
    const een = await signedUrlCached('home-memory', 'hh/keuken.jpg')
    const twee = await signedUrlCached('home-memory', 'hh/keuken.jpg')
    expect(twee).toBe(een)
    expect(maakLink).toHaveBeenCalledTimes(1)
  })

  it('vraagt tien tegels tegelijk maar één keer aan', async () => {
    const { signedUrlCached } = await import('./storage')
    const uit = await Promise.all(
      Array.from({ length: 10 }, () => signedUrlCached('home-memory', 'hh/oven.jpg')),
    )
    expect(new Set(uit).size).toBe(1)
    expect(maakLink).toHaveBeenCalledTimes(1)
  })

  it('houdt fotos uit elkaar', async () => {
    const { signedUrlCached } = await import('./storage')
    const a = await signedUrlCached('home-memory', 'hh/oven.jpg')
    const b = await signedUrlCached('home-memory', 'hh/wasmachine.jpg')
    const c = await signedUrlCached('meds', 'hh/oven.jpg')
    expect(new Set([a, b, c]).size).toBe(3)
    expect(maakLink).toHaveBeenCalledTimes(3)
  })

  it('maakt een verse link na vergeetLink', async () => {
    const { signedUrlCached, vergeetLink } = await import('./storage')
    const een = await signedUrlCached('home-memory', 'hh/keuken.jpg')
    vergeetLink('home-memory', 'hh/keuken.jpg')
    const twee = await signedUrlCached('home-memory', 'hh/keuken.jpg')
    expect(twee).not.toBe(een)
    expect(maakLink).toHaveBeenCalledTimes(2)
  })

  it('vraagt een link die ruim langer meegaat dan het hergebruik', async () => {
    const { signedUrlCached } = await import('./storage')
    await signedUrlCached('home-memory', 'hh/keuken.jpg')
    const [, seconden] = maakLink.mock.calls[0]
    // Vier uur geldig, drie uur hergebruikt: een foto die halverwege laadt,
    // mag niet op een verlopen link stuiten.
    expect(seconden).toBeGreaterThanOrEqual(4 * 3600)
  })
})
