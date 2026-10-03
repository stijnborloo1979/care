import { describe, expect, it, vi } from 'vitest'

const vragen: string[] = []
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabel: string) => {
      let velden = ''
      const k: Record<string, unknown> = {}
      k.select = (v: string) => { velden = v; vragen.push(`${tabel}:${v}`); return k }
      for (const m of ['eq', 'in', 'gte', 'lt', 'order']) k[m] = () => k
      k.then = (r: (x: unknown) => unknown) =>
        Promise.resolve(
          tabel === 'agenda_event' && velden.includes('claimed_by')
            ? { data: null, error: { code: '42703', message: 'column agenda_event.claimed_by does not exist' } }
            : { data: tabel === 'agenda_event' ? [{ id: 'e', household_id: 'h', starts_at: '2026-10-05T10:00:00Z', title: 'Dokter', emoji: null, kind: 'appt', done_at: null }] : [], error: null },
        ).then(r)
      return k
    },
  },
}))

import { getWeekSamen } from './weekSamen'

describe('De week samen zonder migratie 44', () => {
  it('valt terug op een vraag zonder claimed_by in plaats van te falen', async () => {
    const dagen = await getWeekSamen([{ household_id: 'h', person_name: 'Rita', timezone: 'Europe/Brussels' }], '2026-10-05')
    expect(vragen.filter((v) => v.startsWith('agenda_event')).length).toBe(2)
    expect(JSON.stringify(dagen)).toContain('Dokter')
  })
})
