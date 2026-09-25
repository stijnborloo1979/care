import { describe, expect, it } from 'vitest'
import { hoofdstukVan, hoofdstukVanFoto, inHoofdstukken } from './hoofdstukken'
import { VRAGEN } from './vragen'

describe('hoofdstukVan', () => {
  it('zet een schoolvraag bij school en werk', () => {
    expect(hoofdstukVan('Welke juf of meester herinner je je nog?')).toBe('School en werk')
  })

  it('zet de trouwdag bij liefde en gezin', () => {
    expect(hoofdstukVan('Hoe verliep jullie trouwdag?')).toBe('Liefde en gezin')
  })

  it('zet een kindervraag bij de kindertijd', () => {
    expect(hoofdstukVan('Wat was je lievelingsspel als kind?')).toBe('Toen ik klein was')
  })

  it('laat wat niet past achteraan belanden', () => {
    expect(hoofdstukVan('Waar ben je in je leven het meest dankbaar voor?')).toBe('Wat ik meedraag')
  })
})

describe('inHoofdstukken', () => {
  it('laat geen hoofdstuk leeg staan', () => {
    const groepen = inHoofdstukken([{ question: 'Wat was je eerste werk?' }])
    expect(groepen).toHaveLength(1)
    expect(groepen[0].titel).toBe('School en werk')
  })

  it('houdt de volgorde van de hoofdstukken aan, niet die van de antwoorden', () => {
    const groepen = inHoofdstukken([
      { question: 'Waar ben je in je leven het meest dankbaar voor?' },
      { question: 'Wat was je lievelingsspel als kind?' },
    ])
    expect(groepen.map((g) => g.titel)).toEqual(['Toen ik klein was', 'Wat ik meedraag'])
  })

  it('verdeelt elke vraag uit de lijst over een hoofdstuk', () => {
    const groepen = inHoofdstukken(VRAGEN.map((question) => ({ question })))
    const totaal = groepen.reduce((n, g) => n + g.verhalen.length, 0)
    expect(totaal).toBe(VRAGEN.length)
  })

  it('laat niet alles in het resthoofdstuk belanden', () => {
    const groepen = inHoofdstukken(VRAGEN.map((question) => ({ question })))
    const rest = groepen.find((g) => g.titel === 'Wat ik meedraag')
    expect(rest!.verhalen.length).toBeLessThan(VRAGEN.length / 3)
  })
})

describe('hoofdstukVanFoto', () => {
  it('zet een trouwfoto bij liefde en gezin', () => {
    expect(hoofdstukVanFoto('De trouwdag', 'Mei 1968, bij het gemeentehuis.')).toBe(
      'Liefde en gezin',
    )
  })

  it('zet een vakantiefoto bij reizen en plekken', () => {
    expect(hoofdstukVanFoto('Vakantie aan zee', null)).toBe('Reizen en plekken')
  })

  it('laat een foto zonder aanwijzing voor het album achteraan', () => {
    expect(hoofdstukVanFoto('Portret', null)).toBeNull()
  })
})
