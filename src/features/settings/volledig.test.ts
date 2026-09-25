import { describe, expect, it } from 'vitest'
import { STANDAARD, volledig } from './useDisplayPrefs'

/**
 * Wat hier binnenkomt komt uit de database, uit localStorage of uit de
 * bewaarde query-cache — die laatste kan door een oudere versie van de app
 * geschreven zijn en een object van een oudere vorm teruggeven.
 *
 * Ontbrak daarin de taal, dan gaf pasToe() die als undefined door en viel
 * élk scherm van de persoon om. Eén ontbrekend veld hoort geen app te
 * kosten.
 */

describe('volledig', () => {
  it('vult aan wat ontbreekt', () => {
    const uit = volledig({ scale: '1.3' })
    expect(uit.scale).toBe('1.3')
    expect(uit.taal).toBe(STANDAARD.taal)
    expect(uit.contrast).toBe(STANDAARD.contrast)
  })

  it('overleeft een object zonder taal — precies wat er misging', () => {
    const oudeVorm = { scale: '1.15', contrast: 'high', simple: true }
    expect(volledig(oudeVorm).taal).toBe(STANDAARD.taal)
  })

  it('vervangt een onmogelijke taal in plaats van hem door te geven', () => {
    for (const rommel of [undefined, null, '', 'de', 'nl-BE', 42]) {
      expect(volledig({ taal: rommel as never }).taal).toBe(STANDAARD.taal)
    }
  })

  it('geeft de standaard bij rommel in plaats van een object', () => {
    for (const rommel of [null, undefined, 'nee', 42, true]) {
      expect(volledig(rommel)).toEqual(STANDAARD)
    }
  })

  it('laat een geldig object met rust', () => {
    const goed = { ...STANDAARD, taal: 'fr' as const, scale: '1.5' as const }
    expect(volledig(goed)).toEqual(goed)
  })

  it('geeft altijd elk veld terug', () => {
    for (const ruw of [{}, null, { taal: 'fr' }]) {
      expect(Object.keys(volledig(ruw)).sort()).toEqual(Object.keys(STANDAARD).sort())
    }
  })
})
