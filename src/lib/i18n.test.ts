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

/**
 * De app is rond één persoon geschreven — Maria — en dat is in de teksten
 * gekropen. "Ze belt je zo terug" klopt niet wanneer de zoon belt, en
 * "{naam} weet het" beweert iets dat de app niet weet: de vraag om terug te
 * bellen gaat naar iedereen die meezorgt, niet naar die ene persoon.
 *
 * Deze test bewaakt die twee dingen op de plek waar het het meest telt: de
 * geruststelling die iemand met geheugenproblemen te lezen krijgt.
 */
describe('de bevestiging na "vraag of iemand belt"', () => {
  it('belooft niet dat één bepaalde persoon het gezien heeft', () => {
    for (const taal of ['nl', 'fr', 'en'] as const) {
      zetTaal(taal)
      expect(t('hulp.gevraagd', { naam: 'Jens' })).not.toContain('Jens')
    }
  })

  it('maakt van dat familielid geen vrouw', () => {
    zetTaal('nl')
    const zin = t('hulp.gevraagd', { naam: 'Jens' })
    expect(zin).not.toMatch(/\bze belt\b/i)
    expect(zin).not.toMatch(/\bhaar\b/i)
    expect(zin).not.toMatch(/\bzij belt\b/i)
  })

  it('zegt wel iets geruststellends', () => {
    zetTaal('nl')
    expect(t('hulp.gevraagd', { naam: 'Jens' }).length).toBeGreaterThan(10)
  })
})
