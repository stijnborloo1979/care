import { describe, expect, it } from 'vitest'
import {
  datumVandaag,
  leesAllergenen,
  leesDatum,
  leesMenuBestand,
  maandagVan,
  menuVoorBewoners,
  onbekendeAllergenen,
  scheidingsteken,
  weekDagen,
} from './menuPuur'

describe('leesDatum', () => {
  it('leest yyyy-mm-dd, dd-mm-yyyy en dd/mm/yyyy', () => {
    expect(leesDatum('2026-10-26')).toBe('2026-10-26')
    expect(leesDatum('26-10-2026')).toBe('2026-10-26')
    expect(leesDatum('26/10/2026')).toBe('2026-10-26')
    expect(leesDatum('5/3/2026')).toBe('2026-03-05')
  })
  it('weigert onmogelijke en lege datums in plaats van te gokken', () => {
    expect(leesDatum('31-02-2026')).toBeNull()
    expect(leesDatum('donderdag')).toBeNull()
    expect(leesDatum('')).toBeNull()
  })
})

describe('leesMenuBestand', () => {
  const kop = 'Datum;Soep;Allergenen soep;Middagmaal;Allergenen middagmaal;Dessert;Allergenen dessert;Notitie'

  it('leest een puntkomma-bestand met een volledige week', () => {
    const tekst = [
      kop,
      '26-10-2026;Groentesoep;Selderij;Gehaktballetjes;Gluten, Eieren;Vanillepudding;Melk;',
      '27-10-2026;Tomatensoep;;Visfilet;Vis;Fruitsalade;;Vegetarisch',
    ].join('\n')
    const r = leesMenuBestand(tekst, { magAllergenen: true })
    expect(r.fouten).toEqual([])
    expect(r.dagen).toHaveLength(2)
    expect(r.dagen[0]).toMatchObject({
      datum: '2026-10-26',
      soep: 'Groentesoep',
      soep_allergenen: 'Selderij',
      middag_allergenen: 'Gluten, Eieren',
    })
    expect(r.dagen[1].soep_allergenen).toBeNull()
    expect(r.dagen[1].notitie).toBe('Vegetarisch')
  })

  it('leest een komma-bestand met aanhalingstekens rond een komma in een gerecht', () => {
    const tekst = 'Datum,Soep,Middagmaal\n2026-10-26,"Soep, met peterselie","Kip, rijst"'
    const r = leesMenuBestand(tekst, { magAllergenen: false })
    expect(r.fouten).toEqual([])
    expect(r.dagen[0].soep).toBe('Soep, met peterselie')
    expect(r.dagen[0].middag).toBe('Kip, rijst')
  })

  it('laat allergenen weg voor een medewerker, met een waarschuwing', () => {
    const r = leesMenuBestand(`${kop}\n26-10-2026;Soep;Gluten;Kip;Eieren;Taart;Melk;`, { magAllergenen: false })
    expect(r.dagen[0].soep_allergenen).toBeNull()
    expect(r.dagen[0].middag_allergenen).toBeNull()
    expect(r.waarschuwingen.join(' ')).toMatch(/overgeslagen/)
  })

  it('weigert een bestand zonder datumkolom', () => {
    const r = leesMenuBestand('Soep;Middagmaal\nSoep;Kip', { magAllergenen: true })
    expect(r.fouten[0]).toMatch(/Datum/)
    expect(r.dagen).toEqual([])
  })

  it('meldt een ongeldige datum per regel, de rest blijft staan', () => {
    const tekst = `${kop}\n26-10-2026;Soep;;Kip;;;;\n99-99-2026;Soep;;Kip;;;;`
    const r = leesMenuBestand(tekst, { magAllergenen: true })
    expect(r.dagen).toHaveLength(1)
    expect(r.fouten.join(' ')).toMatch(/Regel 3/)
  })

  it('weigert een dag die twee keer voorkomt', () => {
    const tekst = `${kop}\n26-10-2026;A;;;;;;\n2026-10-26;B;;;;;;`
    const r = leesMenuBestand(tekst, { magAllergenen: true })
    expect(r.fouten.join(' ')).toMatch(/twee keer/)
    expect(r.dagen).toHaveLength(1)
  })

  it('waarschuwt bij een lege dag, maar maakt er geen fout van', () => {
    const r = leesMenuBestand(`${kop}\n26-10-2026;;;;;;;`, { magAllergenen: true })
    expect(r.fouten).toEqual([])
    expect(r.waarschuwingen.join(' ')).toMatch(/geen gerechten/)
  })

  it('waarschuwt bij een allergeen dat niet in de lijst van 14 staat', () => {
    const r = leesMenuBestand(`${kop}\n26-10-2026;Soep;Gluten, bloem;;;;;`, { magAllergenen: true })
    expect(r.waarschuwingen.join(' ')).toMatch(/bloem/)
  })

  it('geeft een fout bij een leeg bestand', () => {
    expect(leesMenuBestand('   \n  ', { magAllergenen: true }).fouten[0]).toMatch(/leeg/)
  })

  it('sorteert de dagen op datum', () => {
    const tekst = `${kop}\n28-10-2026;C;;;;;;\n26-10-2026;A;;;;;;`
    const r = leesMenuBestand(tekst, { magAllergenen: true })
    expect(r.dagen.map((d) => d.datum)).toEqual(['2026-10-26', '2026-10-28'])
  })
})

describe('scheidingsteken', () => {
  it('kiest het teken dat de kopregel het meest gebruikt', () => {
    expect(scheidingsteken('Datum;Soep;Dessert')).toBe(';')
    expect(scheidingsteken('Datum,Soep,Dessert')).toBe(',')
  })
})

describe('leesAllergenen en onbekendeAllergenen', () => {
  it('splitst, normaliseert en ontdubbelt', () => {
    expect(leesAllergenen(' Gluten, Melk; gluten ')).toEqual(['gluten', 'melk'])
    expect(leesAllergenen(null)).toEqual([])
  })
  it('vindt allergenen die niet in de lijst van de 14 staan', () => {
    expect(onbekendeAllergenen(['gluten', 'bloem'])).toEqual(['bloem'])
  })
})

describe('weekdagen', () => {
  it('bepaalt de maandag van de week, ook op een zondag', () => {
    expect(maandagVan('2026-10-22')).toBe('2026-10-19') // donderdag
    expect(maandagVan('2026-10-25')).toBe('2026-10-19') // zondag
    expect(maandagVan('2026-10-19')).toBe('2026-10-19') // maandag
  })
  it('geeft zeven opeenvolgende dagen over een maandwissel', () => {
    expect(weekDagen('2026-10-26')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })
})

describe('datumVandaag', () => {
  it('gebruikt de Belgische datum, ook rond middernacht', () => {
    // 23:30 in Brussel op 22 oktober is 21:30 UTC op 22 oktober: nog dezelfde dag.
    expect(datumVandaag(new Date('2026-10-22T21:30:00Z'))).toBe('2026-10-22')
    // 00:30 in Brussel op 23 oktober is 22:30 UTC op 22 oktober: al de volgende dag.
    expect(datumVandaag(new Date('2026-10-22T22:30:00Z'))).toBe('2026-10-23')
  })
})

describe('menuVoorBewoners', () => {
  const rijen = [
    { datum: '2026-10-22', status: 'concept', naam: 'nieuw' },
    { datum: '2026-10-21', status: 'gepubliceerd', naam: 'gisteren' },
  ]
  it('toont nooit een concept', () => {
    expect(menuVoorBewoners(rijen, '2026-10-22')).toBeNull()
  })
  it('toont nooit het menu van een andere dag', () => {
    expect(menuVoorBewoners(rijen, '2026-10-23')).toBeNull()
  })
  it('toont een bevestigd menu van vandaag', () => {
    const vandaag = { datum: '2026-10-22', status: 'gepubliceerd', naam: 'vandaag' }
    expect(menuVoorBewoners([...rijen, vandaag], '2026-10-22')).toEqual(vandaag)
  })
})
