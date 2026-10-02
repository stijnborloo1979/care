import { describe, expect, it } from 'vitest'
import { foutTekst } from './ui'

describe('foutTekst', () => {
  it('toont de boodschap van een Supabase-fout (geen [object Object])', () => {
    expect(foutTekst({ code: '42501', message: 'Deze uitnodiging is voor a@b. Log in met dat adres.' })).toBe(
      'Deze uitnodiging is voor a@b. Log in met dat adres.',
    )
  })
  it('een gewone Error', () => expect(foutTekst(new Error('x'))).toBe('x'))
  it('iets onbekends wordt een nette zin', () => expect(foutTekst({})).toBe('Er ging iets mis. Probeer het opnieuw.'))
})
