import { describe, expect, it } from 'vitest'
import { helften, watStabielBleef, type DagritmeRij, type Helft } from './analyse'

/**
 * Deze regels komen op een verslag dat een arts leest. Een te makkelijk
 * "bleef gelijk" is daar erger dan geen regel: het stelt gerust op
 * gegevens die dat niet dragen.
 */

function med(over: Partial<Helft> = {}): Helft {
  return { tijdstip: '08:00', eerste: 90, laatste: 90, momentenEerste: 30, momentenTweede: 30, ...over }
}

function ritme(over: Partial<DagritmeRij> = {}): DagritmeRij {
  return {
    maand: '2026-07-01',
    dagen: 28,
    vroegste: '07:30',
    mediaan: '08:00',
    laatste: '09:00',
    spreiding: 90,
    ...over,
  }
}

describe('watStabielBleef', () => {
  it('noemt een tijdstip stabiel als het percentage nauwelijks verschoof', () => {
    const uit = watStabielBleef([med({ eerste: 88, laatste: 91 })], [])
    expect(uit).toEqual(['Medicatie van 08:00 bleef rond 91 %.'])
  })

  it('zwijgt over een tijdstip dat duidelijk zakte', () => {
    expect(watStabielBleef([med({ eerste: 95, laatste: 60 })], [])).toEqual([])
  })

  it('zwijgt ook als het duidelijk steeg — dit blok gaat over wat gelijk bleef', () => {
    expect(watStabielBleef([med({ eerste: 50, laatste: 95 })], [])).toEqual([])
  })

  it('zwijgt bij te weinig momenten, ook als de twee helften gelijk zijn', () => {
    const mager = med({ momentenEerste: 3, momentenTweede: 30 })
    expect(watStabielBleef([mager], [])).toEqual([])
    expect(watStabielBleef([med({ momentenTweede: 4 })], [])).toEqual([])
  })

  it('noemt het dagbegin stabiel als de spreiding ongeveer gelijk bleef', () => {
    const uit = watStabielBleef([], [ritme({ spreiding: 90 }), ritme({ spreiding: 110 })])
    expect(uit).toEqual(['De spreiding van het dagbegin bleef ongeveer gelijk.'])
  })

  it('zwijgt als het dagbegin veel meer uiteen ging lopen', () => {
    expect(watStabielBleef([], [ritme({ spreiding: 60 }), ritme({ spreiding: 240 })])).toEqual([])
  })

  it('zwijgt bij één maand: er is dan niets om mee te vergelijken', () => {
    expect(watStabielBleef([], [ritme()])).toEqual([])
  })
})

describe('helften', () => {
  it('splitst de periode in twee stukken die niet overlappen', () => {
    const { eerste, tweede } = helften(90)
    expect(eerste.van < eerste.tot).toBe(true)
    expect(eerste.tot < tweede.van).toBe(true)
    expect(tweede.van < tweede.tot).toBe(true)
  })

  it('valt niet om bij een korte periode', () => {
    const { eerste, tweede } = helften(2)
    expect(eerste.van <= eerste.tot).toBe(true)
    expect(tweede.van <= tweede.tot).toBe(true)
  })
})
