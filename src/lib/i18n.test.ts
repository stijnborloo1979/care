import { afterEach, describe, expect, it } from 'vitest'
import { isTaal, locale, t, taal, zetTaal } from './i18n'

/**
 * t() draait op élk scherm van de persoon. Ging zij stuk, dan was de hele
 * app weg — en dat is precies wat er gebeurde: een bewaarde cache van een
 * oudere versie gaf een instellingenobject zonder taal terug, zetTaal()
 * nam dat over, en daarna viel elke knop om.
 *
 * Deze testen leggen vast dat één slechte waarde nooit meer meer kost dan
 * een zin in de verkeerde taal.
 */

afterEach(() => zetTaal('nl'))

describe('t', () => {
  it('vertaalt', () => {
    expect(t('nav.vandaag')).toBe('Vandaag')
    zetTaal('fr')
    expect(t('nav.vandaag')).toBe("Aujourd'hui")
  })

  it('valt terug op het Nederlands bij een ontbrekende vertaling', () => {
    zetTaal('en')
    expect(t('bestaat.niet.hier')).toBe('bestaat.niet.hier')
  })

  it('vult plaatshouders in', () => {
    expect(t('vandaag.om', { tijd: '14:00' })).toContain('14:00')
  })

  it('blijft werken nadat iemand een onmogelijke taal probeerde te zetten', () => {
    for (const rommel of [undefined, null, '', 'de', 'nl-BE', 42, {}]) {
      zetTaal(rommel as never)
      expect(t('nav.vandaag')).toBe('Vandaag')
      expect(locale()).toBe('nl-BE')
      expect(taal()).toBe('nl')
    }
  })

  it('houdt de vorige taal vast in plaats van een onmogelijke over te nemen', () => {
    zetTaal('fr')
    zetTaal(undefined as never)
    expect(taal()).toBe('fr')
    expect(t('nav.vandaag')).toBe("Aujourd'hui")
  })
})

describe('isTaal', () => {
  it('kent de drie talen en verder niets', () => {
    expect(['nl', 'fr', 'en'].every(isTaal)).toBe(true)
    expect([undefined, null, '', 'de', 'NL', 0, {}, []].some(isTaal)).toBe(false)
  })
})
