import { describe, expect, it } from 'vitest'
import { kiesHuisgenoten, samenvattingInWoorden, type HuisKandidaat } from './huis'

const h = (id: string, opts: Partial<HuisKandidaat> = {}): HuisKandidaat => ({
  household_id: id,
  person_name: id,
  role: 'admin',
  home_id: id,
  ...opts,
})

describe('kiesHuisgenoten', () => {
  it('biedt een ander huishouden aan waar je beheerder van bent', () => {
    expect(kiesHuisgenoten('a', [h('a'), h('b')]).map((x) => x.household_id)).toEqual(['b'])
  })

  it('biedt jezelf niet aan', () => {
    expect(kiesHuisgenoten('a', [h('a')])).toEqual([])
  })

  it('laat huishoudens weg waar je geen beheerder van bent', () => {
    expect(kiesHuisgenoten('a', [h('a'), h('b', { role: 'member' })])).toEqual([])
    expect(kiesHuisgenoten('a', [h('a'), h('b', { role: 'caregiver' })])).toEqual([])
  })

  it('laat een huishouden weg dat zelf al ergens inwoont', () => {
    const uit = kiesHuisgenoten('a', [h('a'), h('b', { home_id: 'c' }), h('c')])
    expect(uit.map((x) => x.household_id)).toEqual(['c'])
  })

  it('biedt een huis aan waar al iemand inwoont', () => {
    // Drie mensen in één woning met één keuken is geen uitzondering maar
    // precies waar dit voor is.
    const uit = kiesHuisgenoten('a', [h('a'), h('b'), h('c', { home_id: 'b' })])
    expect(uit.map((x) => x.household_id)).toEqual(['b'])
  })

  it('biedt niets aan wanneer er bij jou iemand inwoont', () => {
    // Zou a verhuizen, dan sleurt het c mee. De database weigert dat ook.
    expect(kiesHuisgenoten('a', [h('a'), h('b'), h('c', { home_id: 'a' })])).toEqual([])
  })
})

/**
 * De zin na het samenvoegen is het enige wat familie op dat moment ziet, en
 * de enige vraag die ze dan hebben is of er niets verdwenen is. Daarom staan
 * de aantallen erin en is "gelukt" niet genoeg.
 */
describe('samenvattingInWoorden', () => {
  it('noemt wat er verhuisd en samengevoegd is', () => {
    const zin = samenvattingInWoorden({
      kamers_verplaatst: 2,
      kamers_samengevoegd: 1,
      dingen_verplaatst: 5,
      dubbel_weggelaten: 1,
    })
    expect(zin).toContain('2 kamers verhuisd')
    expect(zin).toContain('1 kamer samengevoegd')
    expect(zin).toContain('5 dingen mee')
    expect(zin).toContain('1 leeg dubbel weggelaten')
  })

  it('zwijgt over wat nul is', () => {
    const zin = samenvattingInWoorden({
      kamers_verplaatst: 1,
      kamers_samengevoegd: 0,
      dingen_verplaatst: 0,
      dubbel_weggelaten: 0,
    })
    expect(zin).toContain('1 kamer verhuisd')
    expect(zin).not.toContain('samengevoegd')
    expect(zin).not.toContain('dingen')
  })

  it('zegt het ook wanneer er nog niets stond', () => {
    expect(samenvattingInWoorden({ kamers_verplaatst: 0, dingen_verplaatst: 0 })).toContain(
      'nog niets in',
    )
  })

  it('zegt bij losmaken waar de inhoud blijft', () => {
    const zin = samenvattingInWoorden({ losgemaakt: true })
    expect(zin).toContain('blijven bij het huis')
  })

  it('doet niet alsof er iets gebeurd is als het al gedeeld was', () => {
    expect(samenvattingInWoorden({ al_gedeeld: true })).toContain('al')
  })

  it('gebruikt enkelvoud bij één', () => {
    const zin = samenvattingInWoorden({ kamers_samengevoegd: 1, dingen_verplaatst: 1 })
    expect(zin).toContain('1 kamer samengevoegd')
    expect(zin).toContain('1 ding mee')
    expect(zin).not.toContain('kamers')
    expect(zin).not.toContain('dingen')
  })
})
