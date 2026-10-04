import { describe, expect, it } from 'vitest'
import { herkenRol, leesTabel, naarBewoners, naarMedewerkers, sjabloon } from './importPuur'

describe('importeren uit Excel (84)', () => {
  it('leest geplakte cellen (tabs), CSV met puntkomma en met aanhalingstekens', () => {
    expect(leesTabel('Rita\tLinde\t101\nJos\tEik\t\n')).toEqual([['Rita', 'Linde', '101'], ['Jos', 'Eik', '']])
    expect(leesTabel('﻿Naam;Afdeling\r\n"Peeters; Rita";Linde\r\n\r\n')).toEqual([['Naam', 'Afdeling'], ['Peeters; Rita', 'Linde']])
    expect(leesTabel('a,"zei ""hallo""",c')).toEqual([['a', 'zei "hallo"', 'c']])
  })
  it('herkent koppen in drie talen, ook voornaam + achternaam', () => {
    expect(naarBewoners(leesTabel('Chambre;Nom;Unité;E-mail famille\n12;Rita Peeters;Linde;els@x.be'))).toEqual([
      { naam: 'Rita Peeters', afdeling: 'Linde', kamer: '12', familie: 'els@x.be' },
    ])
    expect(naarBewoners(leesTabel('Voornaam;Achternaam;Room\nRita;Peeters;3'))[0]).toMatchObject({ naam: 'Rita Peeters', kamer: '3' })
  })
  it('zonder kop: naam, afdeling, kamer, e-mail familie', () => {
    expect(naarBewoners([['Rita', 'Linde', '101', 'els@x.be']])[0]).toEqual({ naam: 'Rita', afdeling: 'Linde', kamer: '101', familie: 'els@x.be' })
  })
  it('rollen in NL/FR/EN; leeg is zorgkundige; onbekend is null', () => {
    expect(herkenRol('Coördinator')).toBe('coordinator')
    expect(herkenRol('aide-soignante')).toBe('caregiver')
    expect(herkenRol('Directeur')).toBe('org_admin')
    expect(herkenRol('')).toBe('caregiver')
    expect(herkenRol('kok')).toBeNull()
    expect(naarMedewerkers(leesTabel('E-mail;Rol\nan@x.be;beheerder'))).toEqual([{ email: 'an@x.be', rolTekst: 'beheerder', rol: 'org_admin' }])
  })
  it('het voorbeeldbestand leest zichzelf terug', () => {
    expect(naarBewoners(leesTabel(sjabloon('bewoners')))).toHaveLength(2)
    expect(naarMedewerkers(leesTabel(sjabloon('medewerkers'))).every((m) => m.rol)).toBe(true)
  })
})
