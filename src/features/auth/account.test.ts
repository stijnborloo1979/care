import { describe, expect, it, vi } from 'vitest'
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
import { controleerWachtwoord } from './Account'

describe('controleerWachtwoord', () => {
  it('te kort', () => expect(controleerWachtwoord('kort', 'kort')).toMatch(/minstens 8/))
  it('niet gelijk', () => expect(controleerWachtwoord('lang-genoeg', 'lang-genoeG')).toMatch(/niet gelijk/))
  it('in orde', () => expect(controleerWachtwoord('lang-genoeg', 'lang-genoeg')).toBeNull())
})
