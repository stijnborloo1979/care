import { describe, expect, it } from 'vitest'
import { quickAdd } from './quickAdd'

// Dinsdag 10 maart 2026, 10:00.
const NU = new Date(2026, 2, 10, 10, 0, 0)

function op(resultaat: ReturnType<typeof quickAdd>) {
  if (!resultaat) throw new Error('niets herkend')
  const d = resultaat.startsAt
  return {
    titel: resultaat.titel,
    datum: `${d.getDate()}/${d.getMonth() + 1}`,
    tijd: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  }
}

describe('quickAdd', () => {
  it('begrijpt een weekdag met een uur', () => {
    expect(op(quickAdd('donderdag 14u dokter Janssens', NU))).toEqual({
      titel: 'Dokter Janssens',
      datum: '12/3',
      tijd: '14:00',
    })
  })

  it('neemt altijd de eerstvolgende weekdag, nooit een dag terug', () => {
    // Maandag is gisteren; bedoeld wordt volgende week maandag.
    expect(op(quickAdd('maandag 9u kapper', NU)).datum).toBe('16/3')
  })

  it('begrijpt morgen', () => {
    expect(op(quickAdd('morgen 8u30 bloedafname', NU))).toEqual({
      titel: 'Bloedafname',
      datum: '11/3',
      tijd: '08:30',
    })
  })

  it('begrijpt een datum in cijfers', () => {
    expect(op(quickAdd('14/4 10:15 controle', NU))).toEqual({
      titel: 'Controle',
      datum: '14/4',
      tijd: '10:15',
    })
  })

  it('begrijpt een datum in woorden', () => {
    expect(op(quickAdd('3 april 15u tandarts', NU)).datum).toBe('3/4')
  })

  it('leest "om 3" als de namiddag', () => {
    expect(op(quickAdd('om 3 Els komt langs', NU)).tijd).toBe('15:00')
  })

  it('schuift naar morgen als het uur vandaag al voorbij is', () => {
    expect(op(quickAdd('8u wandeling', NU)).datum).toBe('11/3')
  })

  it('gokt niet wanneer er geen tijd in staat', () => {
    expect(quickAdd('dokter bellen', NU)).toBeNull()
  })

  it('weigert een onmogelijk uur', () => {
    expect(quickAdd('donderdag 25u iets', NU)).toBeNull()
  })

  it('weigert een lege titel', () => {
    expect(quickAdd('morgen 14u', NU)).toBeNull()
  })
})
