import { describe, expect, it } from 'vitest'
import { statusOf, whatNow } from './whatNow'
import type { AgendaEvent } from '../../services/agenda'

/** Een dag in Brussel, met vaste tijden zodat de test niet van de klok afhangt. */
function event(uur: string, extra: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id: `e-${uur}`,
    household_id: 'hh',
    starts_at: `2026-03-10T${uur}:00+01:00`,
    title: `Item ${uur}`,
    emoji: null,
    kind: 'routine',
    note: null,
    person_id: null,
    done_at: null,
    ...extra,
  }
}

const op = (uur: string) => new Date(`2026-03-10T${uur}:00+01:00`)

describe('whatNow', () => {
  const dag = [event('08:00'), event('12:30'), event('14:00'), event('18:00')]

  it('toont het item dat nu bezig is', () => {
    expect(whatNow(dag, op('12:35')).current?.id).toBe('e-12:30')
  })

  it('toont het volgende item al een half uur op voorhand', () => {
    // Het voorbeeld uit de brief: om 12:15 is het tijd voor de lunch.
    expect(whatNow(dag, op('12:15')).current?.id).toBe('e-12:30')
  })

  it('toont niets wanneer er niets in de buurt is', () => {
    expect(whatNow(dag, op('10:00')).current).toBeNull()
    expect(whatNow(dag, op('10:00')).next?.id).toBe('e-12:30')
  })

  it('slaat afgevinkte items over en toont dan rust, niet het volgende uur', () => {
    const met = [event('12:30', { done_at: '2026-03-10T12:31:00+01:00' }), event('14:00')]
    const slot = whatNow(met, op('12:35'))
    // Na de lunch is er niets te doen tot 13:30. Dan hoort er "even
    // rusten" te staan, niet alvast de dokter van 14:00.
    expect(slot.current).toBeNull()
    expect(slot.next?.id).toBe('e-14:00')
  })

  it('laat een item los ruim na het uur, in plaats van het te blijven tonen', () => {
    expect(whatNow(dag, op('14:00')).current?.id).toBe('e-14:00')
    expect(whatNow(dag, op('15:30')).current).toBeNull()
  })

  it('geeft nooit hetzelfde item als nu en als daarna', () => {
    const slot = whatNow(dag, op('12:35'))
    expect(slot.next?.id).not.toBe(slot.current?.id)
  })

  it('rekent in de tijdzone van het item, niet die van de server', () => {
    // Zomertijd gaat in op 29 maart 2026: 08:00 lokaal blijft 08:00.
    const zomer = [
      { ...event('08:00'), starts_at: '2026-03-30T08:00:00+02:00', id: 'zomer' },
    ]
    expect(whatNow(zomer, new Date('2026-03-30T08:05:00+02:00')).current?.id).toBe('zomer')
  })
})

describe('statusOf', () => {
  it('noemt een afgevinkt item gedaan', () => {
    expect(statusOf(event('08:00', { done_at: 'x' }), op('09:00'))).toBe('done')
  })

  it('noemt een item dat voorbij is en niet afgevinkt, voorbij', () => {
    expect(statusOf(event('08:00'), op('12:00'))).toBe('late')
  })

  it('noemt een item binnen twee uur straks', () => {
    expect(statusOf(event('14:00'), op('13:00'))).toBe('soon')
  })

  it('noemt de rest later', () => {
    expect(statusOf(event('18:00'), op('08:00'))).toBe('later')
  })
})
