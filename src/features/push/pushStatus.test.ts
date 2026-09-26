import { describe, expect, it } from 'vitest'
import { leesStatus } from './pushStatus'

/**
 * push_status is drie keer van vorm veranderd: 34_push_nakijken.sql gaf vier
 * kolommen, 35_mail.sql zes, 36_kanalen.sql zeven. Wie een oudere migratie
 * heeft draaien, krijgt dus minder terug — en een ontbrekende kolom mag niet
 * als "staat uit" gelezen worden. Dan waarschuwt het scherm voor iets wat er
 * niet aan de hand is, en dat is precies waarom dit blok bestaat.
 */
describe('leesStatus', () => {
  it('geeft niets terug zonder rij (geen familielid)', () => {
    expect(leesStatus(undefined)).toBeNull()
  })

  it('leest een volledige rij van 36', () => {
    const uit = leesStatus({
      toestellen: 2,
      eigen_toestel: true,
      niveau_ok: true,
      wachtend: 0,
      mail_aan: true,
      wachtend_weg: 1,
      eigen_kanalen: { whatsapp: '+32475123456' },
    })
    expect(uit).toEqual({
      toestellen: 2,
      eigen_toestel: true,
      niveau_ok: true,
      wachtend: 0,
      mail_aan: true,
      wachtend_weg: 1,
      kanalen: { whatsapp: '+32475123456' },
    })
  })

  it('leest wachtend_mail van 35 als wachtend_weg', () => {
    expect(leesStatus({ wachtend_mail: 3 })?.wachtend_weg).toBe(3)
  })

  it('zegt niet dat mail uit staat wanneer 35 nog niet gedraaid is', () => {
    expect(leesStatus({ toestellen: 1 })?.mail_aan).toBe(true)
  })

  it('leest een uitgezette mail wel als uit', () => {
    expect(leesStatus({ mail_aan: false })?.mail_aan).toBe(false)
  })

  it('geeft geen kanalen wanneer de kolom ontbreekt of rommel is', () => {
    for (const ruw of [undefined, null, '{}', 42, [], { whatsapp: 42 }, { sms: '+32475' }]) {
      expect(leesStatus({ eigen_kanalen: ruw })?.kanalen).toEqual({})
    }
  })

  it('laat een leeg adres niet als kanaal doorgaan', () => {
    expect(leesStatus({ eigen_kanalen: { whatsapp: '', telegram: '123' } })?.kanalen).toEqual({
      telegram: '123',
    })
  })

  it('maakt van elk getalveld een getal', () => {
    const uit = leesStatus({ toestellen: null, wachtend: 'twee', wachtend_weg: NaN })
    expect([uit?.toestellen, uit?.wachtend, uit?.wachtend_weg]).toEqual([0, 0, 0])
  })
})
