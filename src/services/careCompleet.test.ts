import { describe, expect, it } from 'vitest'
import { bezettingPerAfdeling, totalen, type Kamer } from './kamersPuur'
import { kamerReeks } from './kamers'
import { maandagVan, weekRooster, type WeekActiviteit } from './weekplanning'
import { naarCsv, periode } from './rapport'
import type { VastMoment } from './afdelingsdagPuur'

const k = (naam: string, dep = 'd1', bedden = 1, actief = true): Kamer => ({ id: `k${naam}`, org_id: 'o', department_id: dep, naam, bedden, actief, notitie: null })
const b = (id: string, kamer: string | null, dep: string | null = 'd1') => ({ household_id: id, naam: `B${id}`, department_id: dep, kamer, sinds: '' })

describe('kamers en bezetting (82)', () => {
  it('koppelt bewoners aan kamers op dezelfde afdeling, telt vrije bedden', () => {
    const s = bezettingPerAfdeling(
      [{ id: 'd1', name: 'Linde' }, { id: 'd2', name: 'Eik' }],
      [k('12'), k('14', 'd1', 2), k('15', 'd1', 1, false), k('12', 'd2')],
      [b('1', '12 '), b('2', '14'), b('3', '99'), b('4', null, 'd2'), b('5', '1', null)],
    )
    const linde = s.find((a) => a.naam === 'Linde')!
    expect(linde.kamers.map((x) => [x.kamer.naam, x.bewoners.length, x.vrij])).toEqual([['12', 1, 0], ['14', 1, 1], ['15', 0, 0]])
    expect(linde.zonderKamer.map((x) => x.household_id)).toEqual(['3'])
    expect(linde.bedden).toBe(3)
    expect(s.find((a) => a.naam === 'Eik')!.zonderKamer.map((x) => x.household_id)).toEqual(['4'])
    expect(s.find((a) => a.id === null)!.zonderKamer.map((x) => x.household_id)).toEqual(['5'])
    expect(totalen(s)).toEqual({ bewoners: 5, bedden: 4, vrij: 2 })
  })
  it('zonder kamers: geen vrije bedden', () => {
    expect(totalen(bezettingPerAfdeling([{ id: 'd1', name: 'A' }], [], [b('1', null)]))).toEqual({ bewoners: 1, bedden: null, vrij: null })
  })
  it('kamerreeks: van-tot en losse namen', () => {
    expect(kamerReeks('101-104')).toEqual(['101', '102', '103', '104'])
    expect(kamerReeks('12, 14;  B3\n12')).toEqual(['12', '14', 'B3'])
    expect(kamerReeks('1-500')).toEqual([])
  })
})

describe('weekplanning', () => {
  it('maandag van de week', () => {
    expect(maandagVan(new Date(2026, 9, 4)).getDate()).toBe(28)
    expect(maandagVan(new Date(2026, 9, 5)).getDate()).toBe(5)
  })
  it('vaste dag op de juiste weekdagen, activiteiten op hun dag, per afdeling', () => {
    const vast: VastMoment[] = [
      { id: 'v1', org_id: 'o', department_id: null, titel: 'Middagmaal', soort: 'maaltijd', emoji: null, begint: '12:00:00', eindigt: null, dagen: [1, 2, 3, 4, 5, 6, 7], actief: true },
      { id: 'v2', org_id: 'o', department_id: 'd2', titel: 'Rust Eik', soort: 'rust', emoji: null, begint: '13:00:00', eindigt: null, dagen: [1], actief: true },
      { id: 'v3', org_id: 'o', department_id: null, titel: 'Uit', soort: 'andere', emoji: null, begint: '09:00:00', eindigt: null, dagen: [1], actief: false },
    ]
    const acts: WeekActiviteit[] = [
      // 10:30 Belgische tijd (CEST = UTC+2), los van de tijdzone van de testmachine.
      { id: 'a1', department_id: 'd1', titel: 'Zingen', starts_at: '2026-10-05T08:30:00Z', plaats: null, status: 'gepland' },
    ]
    const r = weekRooster(new Date(2026, 9, 5), vast, acts, 'd1')
    expect(r[0].items.map((i) => i.titel)).toEqual(['Zingen', 'Middagmaal'])
    expect(r[1].items.map((i) => i.titel)).toEqual(['Middagmaal'])
    expect(weekRooster(new Date(2026, 9, 5), vast, acts, null)[0].items.map((i) => i.titel)).toEqual(['Zingen', 'Middagmaal', 'Rust Eik'])
  })
})

describe('rapporten (83)', () => {
  it('periodes', () => {
    expect(periode('vorige-maand', new Date(2026, 9, 4))).toEqual({ van: '2026-09-01', tot: '2026-09-30' })
    expect(periode('deze-maand', new Date(2026, 9, 4))).toEqual({ van: '2026-10-01', tot: '2026-10-04' })
  })
  it('csv met puntkomma en uitleg bij verborgen cijfers', () => {
    const csv = naarCsv([{ afdeling: null, sleutel: 'bewoners', waarde: 3 }, { afdeling: null, sleutel: 'bezoeken', waarde: null }], '2026-10-01', '2026-10-04')
    expect(csv.split('\r\n')[1]).toBe('2026-10-01 – 2026-10-04;Totaal;Bewoners;3')
    expect(csv).toContain('niet getoond (minder dan 5 bewoners of korter dan 28 dagen)')
  })
})
