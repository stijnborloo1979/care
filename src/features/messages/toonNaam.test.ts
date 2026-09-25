import { describe, expect, it } from 'vitest'
import { toonNaam } from './messages'

/**
 * Dit staat op het scherm van iemand met geheugenproblemen. "Foto van
 * borloo.stijn@telenet.be" zegt haar niets; "Foto van Borloo Stijn" wel.
 */

describe('toonNaam', () => {
  it('laat een echte naam met rust', () => {
    expect(toonNaam('Els Janssens')).toBe('Els Janssens')
    expect(toonNaam('Jan')).toBe('Jan')
  })

  it('maakt van een e-mailadres iets leesbaars', () => {
    expect(toonNaam('borloo.stijn@telenet.be')).toBe('Borloo Stijn')
    expect(toonNaam('els@gmail.com')).toBe('Els')
    expect(toonNaam('jan_peeters@example.org')).toBe('Jan Peeters')
    expect(toonNaam('sofie-de-wit@example.org')).toBe('Sofie De Wit')
  })

  it('valt terug op "Familie" als er niets bruikbaars is', () => {
    expect(toonNaam(null)).toBe('Familie')
    expect(toonNaam(undefined)).toBe('Familie')
    expect(toonNaam('')).toBe('Familie')
    expect(toonNaam('   ')).toBe('Familie')
    expect(toonNaam('@telenet.be')).toBe('Familie')
  })

  it('raakt hoofdletters die er al staan niet kwijt', () => {
    expect(toonNaam('Van Den Berghe')).toBe('Van Den Berghe')
    expect(toonNaam('McDonald@example.org')).toBe('McDonald')
  })
})
