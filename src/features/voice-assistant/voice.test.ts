import { describe, expect, it, vi } from 'vitest'
import { vindDatum, vindTijd } from './datumTijd'
import { corrigeer, isJa, isNee, lokaleInterpretatie, splitsProducten, vulVeld } from './lokaleRegels'
import { valideer, type Gevalideerd } from './valideer'
import { ActionEngine, type ActieContext, type Diensten } from './actionEngine'
import { RUST, verwerk, type GesprekDiensten, type Stand } from './gesprek'
import { AIIntentService, IntentFout, LokaleProvider, type IntentProvider } from './aiIntentService'

// Zondag 27 september 2026, 10:00 in Brussel.
const NU = new Date('2026-09-27T10:00:00+02:00')
const TZ = 'Europe/Brussels'

describe('datum', () => {
  const d = (s: string) => vindDatum(s, NU, TZ).datum
  it('relatief', () => {
    expect(d('vandaag')).toBe('2026-09-27')
    expect(d('morgen moet ik naar de dokter')).toBe('2026-09-28')
    expect(d('overmorgen')).toBe('2026-09-29')
    expect(d('morgenvroeg')).toBe('2026-09-28')
    expect(d('vanavond')).toBe('2026-09-27')
    expect(d('deze namiddag')).toBe('2026-09-27')
  })
  it('weekdagen: altijd de eerstvolgende, nooit vandaag', () => {
    expect(d('maandag')).toBe('2026-09-28')
    expect(d('vrijdag')).toBe('2026-10-02')
    expect(d('zondag')).toBe('2026-10-04')
    expect(d('volgende week vrijdag')).toBe('2026-10-02')
    expect(d('volgende week maandag')).toBe('2026-09-28')
  })
  it('"volgende week" zonder dag is geen datum', () => {
    const u = vindDatum('volgende week moet ik naar de dokter', NU, TZ)
    expect(u.datum).toBeNull()
    expect(u.genoemd).toBe(true)
  })
  it('vaste datums, en een voorbije datum wordt volgend jaar', () => {
    expect(d('14 oktober')).toBe('2026-10-14')
    expect(d('3 maart')).toBe('2027-03-03')
    expect(d('31/2')).toBeNull()
  })
})

describe('tijd', () => {
  it('cijfers en woorden', () => {
    expect(vindTijd('om 14 uur')).toBe('14:00')
    expect(vindTijd('om 14:30')).toBe('14:30')
    expect(vindTijd('14u15')).toBe('14:15')
    expect(vindTijd('om twee uur naar de dokter')).toBe('14:00')
    expect(vindTijd('om 10 uur tandarts')).toBe('10:00')
    expect(vindTijd('rond drie uur')).toBe('15:00')
    expect(vindTijd('half drie')).toBe('14:30')
    expect(vindTijd('kwart voor vier')).toBe('15:45')
  })
  it('dagdelen', () => {
    expect(vindTijd('vanavond om acht uur')).toBe('20:00')
    expect(vindTijd('morgenvroeg om acht uur')).toBe('08:00')
    expect(vindTijd('deze namiddag om vier uur')).toBe('16:00')
  })
  it('een dagdeel zonder uur is geen uur', () => {
    expect(vindTijd('vanavond')).toBeNull()
    expect(vindTijd('morgenvroeg')).toBeNull()
  })
})

describe('lokale interpretatie', () => {
  const li = (s: string) => lokaleInterpretatie(s, NU, TZ)

  it('vier manieren om dezelfde afspraak te zeggen', () => {
    for (const zin of [
      'Plan morgen om 10 uur tandarts.',
      'Morgen moet ik om 10 uur naar de tandarts.',
      'Ik heb morgen om 10 uur tandarts.',
      'Wil je morgen om 10 uur tandarts in mijn agenda zetten?',
    ]) {
      const r = li(zin)
      expect(r.intent, zin).toBe('create_calendar_event')
      expect(r.parameters, zin).toMatchObject({ title: 'Tandarts', date: '2026-09-28', time: '10:00' })
    }
  })

  it('de dokter om twee uur', () => {
    expect(li('Morgen moet ik om twee uur naar de dokter.').parameters).toMatchObject({
      title: 'Dokter',
      date: '2026-09-28',
      time: '14:00',
    })
  })

  it('volgende week zonder dag laat datum en uur open', () => {
    const r = li('Volgende week moet ik naar de dokter.')
    expect(r.intent).toBe('create_calendar_event')
    expect(r.parameters.date).toBeUndefined()
    expect(r.parameters.time).toBeUndefined()
  })

  it('herinnering', () => {
    const r = li('Herinner mij morgen om zes uur aan mijn medicatie.')
    expect(r.intent).toBe('create_reminder')
    expect(r.parameters).toMatchObject({ date: '2026-09-28', time: '18:00' })
    expect(r.parameters.text?.toLowerCase()).toContain('medicatie')
  })

  it('herinnering vanavond zonder uur', () => {
    const r = li('Wil je mij vanavond herinneren aan mijn medicatie?')
    expect(r.intent).toBe('create_reminder')
    expect(r.parameters.date).toBe('2026-09-27')
    expect(r.parameters.time).toBeUndefined()
  })

  it('boodschappen, meerdere producten', () => {
    expect(splitsProducten('Ik moet melk, brood, kaas en appels kopen.')).toEqual(['melk', 'brood', 'kaas', 'appels'])
    const r = li('Ik moet nog melk en brood kopen.')
    expect(r.intent).toBe('add_shopping_item')
    expect(r.parameters.items).toEqual(['melk', 'brood'])
  })

  it('dagboek', () => {
    expect(li('Ik wil iets vertellen.').intent).toBe('record_voice_diary')
  })

  it('bellen en medicatie', () => {
    expect(li('Bel Els').parameters.contact).toBe('Els')
    expect(li('Kun je Jan bellen?').parameters.contact).toBe('Jan')
    expect(li('Ik heb mijn medicatie genomen').intent).toBe('mark_medication_taken')
  })

  it('onduidelijk blijft onbekend', () => {
    expect(li('blauw').intent).toBe('unknown')
  })

  it('ja, nee, correcties', () => {
    expect(isJa('Ja.')).toBe(true)
    expect(isJa('Ja hoor')).toBe(true)
    expect(isNee('Nee.')).toBe(true)
    expect(isNee('Nee, pas aan')).toBe(false)
    expect(corrigeer('nee, om drie uur', NU, TZ)).toEqual({ time: '15:00' })
    expect(vulVeld('date', 'Vrijdag.', NU, TZ)).toEqual({ date: '2026-10-02' })
    expect(vulVeld('time', 'Tien uur.', NU, TZ)).toEqual({ time: '10:00' })
    expect(vulVeld('time', 'tien', NU, TZ)).toEqual({ time: '10:00' })
  })
})

describe('validatie', () => {
  const basis = {
    intent: 'create_calendar_event',
    confidence: 0.94,
    parameters: { title: 'Dokter', date: '2026-09-28', time: '14:00' },
    missing_parameters: [],
    needs_confirmation: true,
  }

  it('aanvaardt geldige uitvoer', () => {
    const v = valideer(basis, NU, TZ)!
    expect(v.intent).toBe('create_calendar_event')
    expect(v.missing_parameters).toEqual([])
    expect(v.needs_confirmation).toBe(true)
  })

  it('weigert rommel', () => {
    expect(valideer(null, NU, TZ)).toBeNull()
    expect(valideer('drop table', NU, TZ)).toBeNull()
    expect(valideer({ ...basis, intent: 'delete_everything' }, NU, TZ)).toBeNull()
  })

  it('lage zekerheid wordt onbekend', () => {
    expect(valideer({ ...basis, confidence: 0.2 }, NU, TZ)!.intent).toBe('unknown')
  })

  it('het model kan bevestigen niet afschaffen', () => {
    expect(valideer({ ...basis, needs_confirmation: false }, NU, TZ)!.needs_confirmation).toBe(true)
  })

  it('wat ontbreekt bepalen wij', () => {
    const v = valideer({ ...basis, parameters: { title: 'Dokter' }, missing_parameters: [] }, NU, TZ)!
    expect(v.missing_parameters).toEqual(['date', 'time'])
  })

  it('verkeerde datum en tijd worden een vraag', () => {
    const v = valideer({ ...basis, parameters: { title: 'Dokter', date: '2026-09-31', time: '25:00' } }, NU, TZ)!
    expect(v.problemen).toEqual(expect.arrayContaining(['datum_ongeldig', 'tijd_ongeldig']))
    expect(v.missing_parameters).toEqual(['date', 'time'])
  })

  it('niets in het verleden', () => {
    const gisteren = valideer({ ...basis, parameters: { title: 'X', date: '2026-09-26', time: '14:00' } }, NU, TZ)!
    expect(gisteren.problemen).toContain('datum_verleden')
    const vanochtend = valideer({ ...basis, parameters: { title: 'X', date: '2026-09-27', time: '08:00' } }, NU, TZ)!
    expect(vanochtend.problemen).toContain('tijd_verleden')
    expect(vanochtend.missing_parameters).toEqual(['time'])
  })

  it('onbekende velden verdwijnen, lijsten worden opgeschoond', () => {
    const v = valideer(
      {
        intent: 'add_shopping_item',
        confidence: 0.9,
        parameters: { items: ['Melk', 'melk', '', 42, 'brood'], sql: 'x' },
        missing_parameters: [],
        needs_confirmation: false,
      },
      NU,
      TZ,
    )!
    expect(v.parameters).toEqual({ items: ['Melk', 'brood'] })
  })
})

// ---------------------------------------------------------------------

function nepDiensten(over: Partial<Diensten> = {}): Diensten {
  return {
    voegAfspraakToe: vi.fn(async () => {}),
    voegBoodschappenToe: vi.fn(async (p) => p.namen.length),
    bewaarDagboek: vi.fn(async () => {}),
    stuurBericht: vi.fn(async () => {}),
    bevestigMedicatie: vi.fn(async () => {}),
    ...over,
  }
}

const CTX: ActieContext = {
  householdId: 'hh',
  tz: TZ,
  nu: NU,
  mensen: [
    { naam: 'Els', telefoon: '0470 00 00 00' },
    { naam: 'Jan', telefoon: null },
  ],
  medicatie: [
    { id: 'm1', due_at: '2026-09-27T08:00:00+02:00', taken_at: null },
    { id: 'm2', due_at: '2026-09-27T20:00:00+02:00', taken_at: null },
  ],
  magBellen: true,
  dagboekDelen: true,
}

function gesprek(diensten: Diensten, ai?: IntentProvider) {
  const engine = new ActionEngine(diensten)
  const service = new AIIntentService(ai ?? new LokaleProvider(), new LokaleProvider())
  let n = 0
  const d: GesprekDiensten = {
    nu: () => NU,
    tz: TZ,
    taal: 'nl',
    nieuwId: () => `actie-${++n}`,
    interpreteer: async (tekst, lopend) =>
      (await service.interpreteer({ tekst, householdId: 'hh', taal: 'nl', tz: TZ, nu: NU, lopend })).resultaat,
    voerUit: (v, id, audio) => engine.voerUit(v, id, audio ? { ...CTX, audio } : CTX),
    beantwoord: async () => ({ zeg: 'Om 14:00 dokter.' }),
  }
  return d
}

describe('gesprek', () => {
  it('afspraak: bevestigen, dan pas uitvoeren', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Morgen moet ik om twee uur naar de dokter.' }, d)
    expect(b1.status).toBe('bevestig')
    expect(b1.zeg).toContain('twee uur')
    expect(diensten.voegAfspraakToe).not.toHaveBeenCalled()

    const b2 = await verwerk(b1.stand, { soort: 'tekst', tekst: 'Ja.' }, d)
    expect(b2.status).toBe('gelukt')
    expect(b2.zeg).toBe('Prima. Ik heb het in je agenda gezet.')
    expect(diensten.voegAfspraakToe).toHaveBeenCalledTimes(1)
    const arg = (diensten.voegAfspraakToe as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.startsAt.toISOString()).toBe('2026-09-28T12:00:00.000Z')
    expect(arg.titel).toBe('Dokter')
  })

  it('ontbrekende informatie wordt gevraagd, één ding tegelijk', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Volgende week moet ik naar de dokter.' }, d)
    expect(b1.zeg).toBe('Welke dag bedoel je?')
    const b2 = await verwerk(b1.stand, { soort: 'tekst', tekst: 'Vrijdag.' }, d)
    expect(b2.zeg).toBe('Hoe laat?')
    const b3 = await verwerk(b2.stand, { soort: 'tekst', tekst: 'Tien uur.' }, d)
    expect(b3.status).toBe('bevestig')
    expect(b3.zeg).toContain('tien uur')
    expect(diensten.voegAfspraakToe).not.toHaveBeenCalled()
  })

  it('"nee" annuleert en voert niets uit', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Plan morgen om 10 uur tandarts.' }, d)
    const b2 = await verwerk(b1.stand, { soort: 'knop', knop: 'nee' }, d)
    expect(b2.status).toBe('geannuleerd')
    expect(b2.stand).toEqual(RUST)
    expect(diensten.voegAfspraakToe).not.toHaveBeenCalled()
  })

  it('"pas aan" en dan een nieuw uur', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Plan morgen om 10 uur tandarts.' }, d)
    const b2 = await verwerk(b1.stand, { soort: 'tekst', tekst: 'Pas aan' }, d)
    expect(b2.zeg).toBe('Wat wil je aanpassen?')
    const b3 = await verwerk(b2.stand, { soort: 'tekst', tekst: 'Om elf uur' }, d)
    expect(b3.status).toBe('bevestig')
    expect(b3.zeg).toContain('elf uur')
    const b4 = await verwerk(b3.stand, { soort: 'knop', knop: 'ja' }, d)
    expect(b4.status).toBe('gelukt')
    const arg = (diensten.voegAfspraakToe as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.startsAt.toISOString()).toBe('2026-09-28T09:00:00.000Z')
  })

  it('"nee, om drie uur" is een correctie, geen annulering', async () => {
    const d = gesprek(nepDiensten())
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Plan morgen om 10 uur tandarts.' }, d)
    const b2 = await verwerk(b1.stand, { soort: 'tekst', tekst: 'Nee, om drie uur' }, d)
    expect(b2.status).toBe('bevestig')
    expect(b2.zeg).toContain('drie uur')
  })

  it('dubbel op JA tikken maakt één afspraak', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Plan morgen om 10 uur tandarts.' }, d)
    const [x, y] = await Promise.all([
      verwerk(b1.stand, { soort: 'knop', knop: 'ja' }, d),
      verwerk(b1.stand, { soort: 'knop', knop: 'ja' }, d),
    ])
    expect(x.status).toBe('gelukt')
    expect(y.status).toBe('gelukt')
    expect(diensten.voegAfspraakToe).toHaveBeenCalledTimes(1)
  })

  it('een mislukte actie wordt nooit als gelukt gemeld', async () => {
    const diensten = nepDiensten({
      voegAfspraakToe: vi.fn(async () => {
        throw new Error('netwerk')
      }),
    })
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Plan morgen om 10 uur tandarts.' }, d)
    const b2 = await verwerk(b1.stand, { soort: 'knop', knop: 'ja' }, d)
    expect(b2.status).toBe('mislukt')
    expect(b2.zeg).toBe('Ik heb het niet kunnen toevoegen. Probeer het opnieuw.')
  })

  it('boodschappen zonder bevestiging, met de juiste zin', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b = await verwerk(RUST, { soort: 'tekst', tekst: 'Ik moet melk, brood, kaas en appels kopen.' }, d)
    expect(b.status).toBe('gelukt')
    expect(b.zeg).toBe('Ik heb melk, brood, kaas en appels toegevoegd.')
  })

  it('dagboek: opnemen, dan bewaren met audio', async () => {
    const diensten = nepDiensten()
    const d = gesprek(diensten)
    const b1 = await verwerk(RUST, { soort: 'tekst', tekst: 'Ik wil iets vertellen.' }, d)
    expect(b1.status).toBe('dagboek')
    expect(b1.zeg).toBe('Natuurlijk. Ik luister.')
    const blob = new Blob(['x'], { type: 'audio/webm' })
    const b2 = await verwerk(
      b1.stand,
      { soort: 'opname', blob, mimeType: 'audio/webm', seconden: 12, transcript: 'Vandaag ben ik met mijn dochter naar de markt geweest.' },
      d,
    )
    expect(b2.status).toBe('gelukt')
    const arg = (diensten.bewaarDagboek as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(arg.audio.blob).toBe(blob)
    expect(arg.tekst).toContain('markt')
    expect(arg.titel).toBe('Vandaag ben ik met mijn dochter naar…')
  })

  it('spraak mislukt: de vraag blijft staan', async () => {
    const d = gesprek(nepDiensten())
    const stand: Stand = (await verwerk(RUST, { soort: 'tekst', tekst: 'Volgende week moet ik naar de dokter.' }, d)).stand
    const b = await verwerk(stand, { soort: 'nietVerstaan' }, d)
    expect(b.zeg).toBe('Ik kon je niet goed verstaan. Probeer het nog eens.')
    expect(b.stand).toBe(stand)
    expect(b.luisterNa).toBe(true)
  })

  it('AI onbereikbaar: de lokale regels nemen over', async () => {
    const stuk: IntentProvider = {
      naam: 'stuk',
      interpreteer: async () => {
        throw new IntentFout('onbereikbaar')
      },
    }
    const d = gesprek(nepDiensten(), stuk)
    const b = await verwerk(RUST, { soort: 'tekst', tekst: 'Ik moet melk kopen' }, d)
    expect(b.status).toBe('gelukt')
  })

  it('AI onbereikbaar en de regels weten het niet: eerlijk zeggen', async () => {
    const stuk: IntentProvider = {
      naam: 'stuk',
      interpreteer: async () => {
        throw new IntentFout('onbereikbaar')
      },
    }
    const d = gesprek(nepDiensten(), stuk)
    const b = await verwerk(RUST, { soort: 'tekst', tekst: 'blauw paars groen' }, d)
    expect(b.zeg).toBe('Ik kan je vraag momenteel niet verwerken. Probeer het opnieuw.')
  })

  it('ongeldige AI-uitvoer voert nooit iets uit', async () => {
    const diensten = nepDiensten()
    const raar: IntentProvider = {
      naam: 'raar',
      interpreteer: async () => ({ intent: 'drop_database', confidence: 1, parameters: {} }),
    }
    const d = gesprek(diensten, raar)
    const b = await verwerk(RUST, { soort: 'tekst', tekst: 'xyz qqq' }, d)
    expect(b.status).toBe('mislukt')
    expect(Object.values(diensten).every((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length === 0)).toBe(true)
  })
})

describe('action engine', () => {
  const engine = () => new ActionEngine(nepDiensten())
  const v = (intent: string, parameters = {}) =>
    valideer({ intent, confidence: 0.9, parameters, missing_parameters: [], needs_confirmation: false }, NU, TZ) as Gevalideerd

  it('bellen: onbekend, geen nummer, gelukt', async () => {
    expect((await engine().voerUit(v('call_contact', { contact: 'Piet' }), 'a', CTX)).zeg).toBe(
      'Ik ken niemand die Piet heet.',
    )
    expect((await engine().voerUit(v('call_contact', { contact: 'Jan' }), 'b', CTX)).zeg).toBe(
      'Ik heb geen telefoonnummer van Jan.',
    )
    const ok = await engine().voerUit(v('call_contact', { contact: 'els' }), 'c', CTX)
    expect(ok.gelukt && ok.bellen?.naam).toBe('Els')
  })

  it('medicatie: alleen wat open staat en binnen het uur', async () => {
    const d = nepDiensten()
    await new ActionEngine(d).voerUit(v('mark_medication_taken'), 'm', CTX)
    expect(d.bevestigMedicatie).toHaveBeenCalledWith(['m1'])
  })

  it('weigert een object dat niet door valideer() kwam', async () => {
    const nep = { intent: 'create_calendar_event', parameters: {}, missing_parameters: [] } as unknown as Gevalideerd
    const u = await engine().voerUit(nep, 'x', CTX)
    expect(u.gelukt).toBe(false)
  })

  it('weigert als er nog iets ontbreekt', async () => {
    const u = await engine().voerUit(v('create_calendar_event', { title: 'Dokter' }), 'y', CTX)
    expect(u.gelukt).toBe(false)
  })
})
