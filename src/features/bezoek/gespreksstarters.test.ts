import { describe, expect, it } from 'vitest'
import { gespreksstarters } from './gespreksstarters'

const foto = (id: string, title: string, year: number | null = null) => ({ id, household_id: 'h', year, taken_on: null, title, story: null, photo_path: `h/photos/${id}.jpg`, created_at: '' })
const verhaal = (id: string, question: string, soort: 'verhaal' | 'dagboek' = 'verhaal') => ({ id, household_id: 'h', question, body: 'tekst', audio_path: null, audio_seconds: null, shared: true, created_at: '', soort })

describe('gespreksstarters', () => {
  it('een foto en een verhaal, met de naam', () => {
    const s = gespreksstarters([foto('1', 'Huwelijk', 1985)], [verhaal('v', 'Je eerste werk')], '2026-10-02', 'Rita')
    expect(s.map((x) => x.tekst)).toEqual([
      'Huwelijk (1985). Toon de foto en vraag wat Rita zich ervan herinnert.',
      'Rita vertelde over "Je eerste werk". Vraag er eens meer over.',
    ])
  })
  it('nooit uit het dagboek', () => {
    expect(gespreksstarters([], [verhaal('d', 'Vandaag', 'dagboek')], '2026-10-02', 'Rita')).toEqual([])
  })
  it('dezelfde dag dezelfde keuze, een andere dag mag anders', () => {
    const f = [foto('1', 'A'), foto('2', 'B'), foto('3', 'C'), foto('4', 'D')]
    expect(gespreksstarters(f, [], '2026-10-02', 'R')).toEqual(gespreksstarters(f, [], '2026-10-02', 'R'))
    const dagen = new Set(['01', '02', '03', '04', '05', '06', '07'].map((d) => gespreksstarters(f, [], `2026-10-${d}`, 'R')[0].sleutel))
    expect(dagen.size).toBeGreaterThan(1)
  })
})
