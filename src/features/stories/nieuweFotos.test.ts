import { describe, expect, it } from 'vitest'
import { nieuweFotos } from './nieuweFotos'
import type { MemoryPhoto } from '../../services/memories'
import type { LifeStory } from '../../services/stories'

const foto = (id: string, pad: string | null = `hh/photos/${id}/a.jpg`): MemoryPhoto => ({
  id,
  household_id: 'hh',
  year: null,
  taken_on: null,
  title: id,
  story: null,
  photo_path: pad,
  created_at: '2026-10-01T00:00:00Z',
})

const verhaal = (foto_id: string | null): LifeStory =>
  ({ id: 'v', household_id: 'hh', question: 'q', body: 'x', audio_path: null, audio_seconds: null, shared: true, created_at: '', foto_id }) as LifeStory

describe('nieuweFotos', () => {
  it('toont foto\'s zonder verhaal', () => {
    expect(nieuweFotos([foto('a'), foto('b')], []).map((f) => f.id)).toEqual(['a', 'b'])
  })

  it('verbergt een foto die al verteld is', () => {
    expect(nieuweFotos([foto('a'), foto('b')], [verhaal('a')]).map((f) => f.id)).toEqual(['b'])
  })

  it('negeert verhalen zonder foto', () => {
    expect(nieuweFotos([foto('a')], [verhaal(null)]).map((f) => f.id)).toEqual(['a'])
  })

  it('toont geen foto zonder bestand', () => {
    expect(nieuweFotos([foto('a', null)], [])).toEqual([])
  })
})
