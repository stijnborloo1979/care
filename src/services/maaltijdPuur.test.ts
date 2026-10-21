import { describe, expect, it } from 'vitest'
import { isoDag, maaltijdMomenten, nietGeregistreerd, opvallend, procent, totaal, type MaaltijdRij } from './maaltijdPuur'
import type { VastMoment } from './afdelingsdagPuur'

const rij = (p: Partial<MaaltijdRij>): MaaltijdRij => ({
  afdeling_naam: 'Afd A', moment_titel: 'Middagmaal', aantal_verwacht: 10, aantal_geregistreerd: 10,
  aantal_gegeten: 6, aantal_half: 2, aantal_niet: 2, ...p,
})

const moment = (p: Partial<VastMoment>): VastMoment => ({
  id: 'm', org_id: 'o', department_id: null, titel: 'Ontbijt', soort: 'maaltijd', emoji: null,
  begint: '08:00', eindigt: null, dagen: [1, 2, 3, 4, 5, 6, 7], actief: true, ...p,
})

describe('maaltijd analyse', () => {
  it('procent is afgerond en veilig bij nul', () => {
    expect(procent(1, 3)).toBe(33)
    expect(procent(2, 3)).toBe(67)
    expect(procent(0, 0)).toBe(0)
  })
  it('niet geregistreerd is nooit negatief', () => {
    expect(nietGeregistreerd({ aantal_verwacht: 10, aantal_geregistreerd: 7 })).toBe(3)
    expect(nietGeregistreerd({ aantal_verwacht: 5, aantal_geregistreerd: 7 })).toBe(0)
  })
  it('valt op vanaf 20 procent "niet", niet eerder', () => {
    expect(opvallend(rij({ aantal_verwacht: 10, aantal_niet: 2 }))).toBe(true)
    expect(opvallend(rij({ aantal_verwacht: 10, aantal_niet: 1 }))).toBe(false)
    expect(opvallend(rij({ aantal_verwacht: 0, aantal_niet: 0 }))).toBe(false)
  })
  it('totaal over alle maaltijden', () => {
    const t = totaal([rij({ aantal_verwacht: 10, aantal_gegeten: 6, aantal_half: 2, aantal_niet: 2, aantal_geregistreerd: 10 }),
      rij({ aantal_verwacht: 10, aantal_gegeten: 9, aantal_half: 0, aantal_niet: 1, aantal_geregistreerd: 8 })])
    expect(t).toEqual({ verwacht: 20, gegeten: 75, half: 10, niet: 15, nietGeregistreerd: 2 })
  })
})

describe('maaltijden van vandaag', () => {
  it('weekdag: maandag is 1, zondag is 7', () => {
    expect(isoDag(new Date('2026-10-19T12:00:00'))).toBe(1)
    expect(isoDag(new Date('2026-10-25T12:00:00'))).toBe(7)
  })
  it('alleen maaltijden van het huis en de afdeling, op die weekdag, gesorteerd op tijd', () => {
    const vast = [
      moment({ id: 'avond', begint: '18:00' }),
      moment({ id: 'huis-ontbijt', begint: '08:00' }),
      moment({ id: 'andere-afd', department_id: 'afd-b', begint: '12:00' }),
      moment({ id: 'rust', soort: 'rust', begint: '15:00' }),
      moment({ id: 'inactief', actief: false, begint: '09:00' }),
      moment({ id: 'alleen-zondag', dagen: [7], begint: '10:00' }),
      moment({ id: 'eigen-afd', department_id: 'afd-a', begint: '13:00' }),
    ]
    const ids = maaltijdMomenten(vast, 'afd-a', new Date('2026-10-19T12:00:00')).map((m) => m.id)
    expect(ids).toEqual(['huis-ontbijt', 'eigen-afd', 'avond'])
  })
})
