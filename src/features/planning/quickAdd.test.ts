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

  describe('in het Frans en het Engels', () => {
    it('jeudi 14h médecin', () => {
      expect(op(quickAdd('jeudi 14h médecin', NU))).toEqual({ titel: 'Médecin', datum: '12/3', tijd: '14:00' })
    })
    it('demain à 9 heures coiffeur', () => {
      expect(op(quickAdd('demain à 9 heures coiffeur', NU))).toEqual({ titel: 'Coiffeur', datum: '11/3', tijd: '09:00' })
    })
    it('après-demain is niet morgen', () => {
      expect(op(quickAdd('après-demain 10h30 kiné', NU)).datum).toBe('12/3')
    })
    it('14 avril 15h dentiste', () => {
      expect(op(quickAdd('14 avril 15h dentiste', NU))).toEqual({ titel: 'Dentiste', datum: '14/4', tijd: '15:00' })
    })
    it('tomorrow 2pm doctor', () => {
      expect(op(quickAdd('tomorrow 2pm doctor', NU))).toEqual({ titel: 'Doctor', datum: '11/3', tijd: '14:00' })
    })
    it('friday 9:30 am hairdresser', () => {
      expect(op(quickAdd('friday 9:30 am hairdresser', NU))).toEqual({ titel: 'Hairdresser', datum: '13/3', tijd: '09:30' })
    })
    it('march 20 at 11 dentist', () => {
      expect(op(quickAdd('march 20 at 11 dentist', NU))).toEqual({ titel: 'Dentist', datum: '20/3', tijd: '11:00' })
    })
    it('12 am is middernacht, 12 pm is middag', () => {
      expect(op(quickAdd('tomorrow 12 pm lunch', NU)).tijd).toBe('12:00')
      expect(op(quickAdd('tomorrow 12 am alarm', NU)).tijd).toBe('00:00')
    })
    it('het Nederlands blijft werken: morgen is niet overmorgen', () => {
      expect(op(quickAdd('overmorgen 14u dokter', NU)).datum).toBe('12/3')
      expect(op(quickAdd('morgen 14u dokter', NU)).datum).toBe('11/3')
    })
  })
})
