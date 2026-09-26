import { describe, expect, it } from 'vitest'
import { STANDAARD, magBellen, volledig, type DisplayPrefs } from './useDisplayPrefs'

/**
 * De belknop is de gevaarlijkste knop in de app: staat er een 112 op een
 * toestel dat niet kan bellen, dan wacht iemand in een noodsituatie op hulp
 * die niet komt. Daarom hier één regel per manier waarop dat kon gebeuren.
 */

function met(kanBellen: DisplayPrefs['kanBellen']): DisplayPrefs {
  return { ...STANDAARD, kanBellen }
}

describe('magBellen', () => {
  it('"ja" geldt overal, ook op een tablet', () => {
    expect(magBellen(met('ja'), false)).toBe(true)
    expect(magBellen(met('ja'), true)).toBe(true)
  })

  it('"nee" geldt nergens, ook niet op een telefoon', () => {
    expect(magBellen(met('nee'), true)).toBe(false)
    expect(magBellen(met('nee'), false)).toBe(false)
  })

  it('"telefoon" laat het toestel beslissen', () => {
    expect(magBellen(met('telefoon'), true)).toBe(true)
    expect(magBellen(met('telefoon'), false)).toBe(false)
  })
})

describe('volledig — kanBellen van vroeger', () => {
  it('leest de oude false als nergens', () => {
    expect(volledig({ kanBellen: false }).kanBellen).toBe('nee')
  })

  it('leest de oude true als overal', () => {
    expect(volledig({ kanBellen: true }).kanBellen).toBe('ja')
  })

  it('laat een geldige stand staan', () => {
    for (const s of ['nee', 'telefoon', 'ja'] as const) {
      expect(volledig({ kanBellen: s }).kanBellen).toBe(s)
    }
  })

  it('valt bij rommel terug op alleen-op-een-telefoon', () => {
    for (const rommel of [undefined, null, '', 'misschien', 42]) {
      expect(volledig({ kanBellen: rommel as never }).kanBellen).toBe('telefoon')
    }
  })

  it('geeft nooit iets anders dan een geldige stand terug', () => {
    for (const ruw of [{}, null, { kanBellen: {} }, { kanBellen: [] }]) {
      expect(['nee', 'telefoon', 'ja']).toContain(volledig(ruw).kanBellen)
    }
  })

  it('houdt het noodplan een string, wat er ook in de rij staat', () => {
    expect(volledig({ noodplan: null as never }).noodplan).toBe('')
    expect(volledig({ noodplan: 42 as never }).noodplan).toBe('')
    expect(volledig({ noodplan: 'Bel aan bij nummer 14' }).noodplan).toBe('Bel aan bij nummer 14')
  })
})
