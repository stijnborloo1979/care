import { afterEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { isTaal, locale, t, taal, woordenboekVan, zetTaal } from './i18n'

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

describe('volledigheid', () => {
  const plaatshouders = (z: string) => [...new Set([...z.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',')

  it('elke sleutel bestaat in het Nederlands, het Frans en het Engels', () => {
    const nl = Object.keys(woordenboekVan('nl'))
    for (const tl of ['fr', 'en'] as const) {
      const ander = woordenboekVan(tl)
      expect(nl.filter((k) => !(k in ander)), `ontbreekt in ${tl}`).toEqual([])
      expect(Object.keys(ander).filter((k) => !nl.includes(k)), `alleen in ${tl}`).toEqual([])
    }
  })

  it('dezelfde plaatshouders in elke taal', () => {
    const nl = woordenboekVan('nl')
    const fout: string[] = []
    for (const tl of ['fr', 'en'] as const)
      for (const [k, v] of Object.entries(woordenboekVan(tl))) if (plaatshouders(v) !== plaatshouders(nl[k] ?? '')) fout.push(`${tl}: ${k}`)
    expect(fout).toEqual([])
  })

  it("elke t('…') in de code bestaat in het woordenboek", () => {
    const nl = woordenboekVan('nl')
    const bestanden = (map: string): string[] =>
      readdirSync(map).flatMap((n) => {
        const p = join(map, n)
        if (statSync(p).isDirectory()) return bestanden(p)
        return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
      })
    const onbekend: string[] = []
    for (const f of bestanden(join(__dirname, '..'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?<![\w.])(?:t|vertaal)\(\s*'([\w.]+)'/g)) {
        if (!(m[1] in nl)) onbekend.push(`${f.split('/src/')[1]}: ${m[1]}`)
      }
    }
    expect(onbekend).toEqual([])
  })
})
