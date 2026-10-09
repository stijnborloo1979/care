import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Een nagebootste spraakmotor, zoals de browser die geeft.
class Uitspraak {
  text: string
  lang = ''
  rate = 1
  voice: unknown = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}
const motor = {
  speaking: false,
  pending: false,
  paused: false,
  gesproken: [] as Uitspraak[],
  geannuleerd: 0,
  hervat: 0,
  stemmen: [] as { lang: string; name: string; localService: boolean }[],
  speak(u: Uitspraak) { this.gesproken.push(u) },
  cancel() { this.geannuleerd++ },
  resume() { this.hervat++; this.paused = false },
  getVoices() { return this.stemmen },
  addEventListener() {},
}

let mod: typeof import('./voorlezen')

beforeAll(async () => {
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('speechSynthesis', motor)
  vi.stubGlobal('SpeechSynthesisUtterance', Uitspraak)
  mod = await import('./voorlezen')
})

beforeEach(() => {
  Object.assign(motor, { speaking: false, pending: false, paused: false, gesproken: [], geannuleerd: 0, hervat: 0, stemmen: [] })
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('zinnen', () => {
  it('knipt per zin', () => {
    expect(mod.zinnen('Vul het water. Zet een kopje! Klaar?')).toEqual(['Vul het water.', 'Zet een kopje!', 'Klaar?'])
  })
  it('laat korte tekst zonder punt heel', () => {
    expect(mod.zinnen('Koffiezetapparaat')).toEqual(['Koffiezetapparaat'])
  })
  it('knipt een heel lange zin op woorden', () => {
    const lang = Array(60).fill('woord').join(' ')
    const delen = mod.zinnen(lang, 50)
    expect(delen.every((d) => d.length <= 50)).toBe(true)
    expect(delen.join(' ')).toBe(lang)
  })
  it('lege tekst geeft niets', () => {
    expect(mod.zinnen('  ')).toEqual([])
  })
})

describe('stemVoor', () => {
  const s = (lang: string, localService = false) => ({ lang, name: lang, localService }) as unknown as SpeechSynthesisVoice
  it('kiest eerst de juiste regio', () => {
    expect(mod.stemVoor('nl-BE', [s('nl-NL'), s('nl-BE'), s('en-GB')])?.lang).toBe('nl-BE')
  })
  it('valt terug op dezelfde taal', () => {
    expect(mod.stemVoor('nl-BE', [s('en-GB'), s('nl-NL')])?.lang).toBe('nl-NL')
  })
  it('begrijpt nl_NL zoals Android het soms schrijft', () => {
    expect(mod.stemVoor('nl-BE', [s('nl_NL')])?.lang).toBe('nl_NL')
  })
  it('liever een stem op het toestel zelf', () => {
    expect(mod.stemVoor('nl-BE', [s('nl-BE'), s('nl-BE', true)])?.localService).toBe(true)
  })
  it('geen stem in die taal: niets kiezen', () => {
    expect(mod.stemVoor('nl-BE', [s('en-GB')])).toBeUndefined()
  })
})

describe('voorlezen', () => {
  it('spreekt meteen als er niets bezig is, zonder te annuleren', () => {
    expect(mod.voorlezen('Hallo. Daar ben ik.')).toBe(true)
    expect(motor.geannuleerd).toBe(0)
    expect(motor.gesproken.map((u) => u.text)).toEqual(['Hallo.', 'Daar ben ik.'])
  })

  it('annuleert wat bezig is en spreekt pas daarna', () => {
    motor.speaking = true
    mod.voorlezen('Nieuwe zin.')
    expect(motor.geannuleerd).toBe(1)
    expect(motor.gesproken).toHaveLength(0)
    vi.advanceTimersByTime(150)
    expect(motor.gesproken.map((u) => u.text)).toEqual(['Nieuwe zin.'])
  })

  it('haalt een vastgelopen pauze weg', () => {
    motor.paused = true
    mod.voorlezen('Hallo.')
    expect(motor.hervat).toBe(1)
  })

  it('kiest een Nederlandse stem als die er is', () => {
    motor.stemmen = [{ lang: 'en-GB', name: 'en', localService: true }, { lang: 'nl-NL', name: 'Xander', localService: true }]
    mod.voorlezen('Hallo.')
    expect((motor.gesproken[0].voice as { name: string }).name).toBe('Xander')
    expect(motor.gesproken[0].lang).toBe('nl-NL')
  })

  it('zonder stemmen: taalcode van de app', () => {
    mod.voorlezen('Hallo.')
    expect(motor.gesproken[0].voice).toBeNull()
    expect(motor.gesproken[0].lang).toMatch(/^nl/)
  })

  it('onEinde één keer, na de laatste zin', () => {
    const einde = vi.fn()
    mod.voorlezen('Een. Twee.', { onEinde: einde })
    motor.gesproken[0].onend?.()
    expect(einde).not.toHaveBeenCalled()
    motor.gesproken[1].onend?.()
    motor.gesproken[1].onerror?.()
    expect(einde).toHaveBeenCalledTimes(1)
  })

  it('niets te zeggen: false en meteen onEinde', () => {
    const einde = vi.fn()
    expect(mod.voorlezen('   ', { onEinde: einde })).toBe(false)
    expect(einde).toHaveBeenCalledTimes(1)
    expect(motor.gesproken).toHaveLength(0)
  })
})
