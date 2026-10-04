import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { tt, woordenboek, zetUiTaalVoorTest } from './uiTaal'

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((n) => {
    const p = join(map, n)
    if (statSync(p).isDirectory()) return bestanden(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

/** Alle letterlijke sleutels: tt('…') en tt("…"). */
function sleutels(): { bestand: string; sleutel: string }[] {
  const uit: { bestand: string; sleutel: string }[] = []
  const re = /\btt\(\s*(['"])((?:\\.|(?!\1).)*?)\1/gs
  for (const f of bestanden(join(__dirname, '..'))) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(re)) uit.push({ bestand: f, sleutel: m[2].replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1') })
  }
  return uit
}

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',')

describe('taal van de schermen', () => {
  it('elke tekst in tt() heeft een Franse en een Engelse vertaling', () => {
    const fr = woordenboek('fr')
    const en = woordenboek('en')
    const mist = sleutels().filter(({ sleutel }) => !(sleutel in fr) || !(sleutel in en))
    expect(mist.map((m) => `${m.bestand.split('/src/')[1]}: ${m.sleutel}`)).toEqual([])
  })
  it('placeholders zijn in elke taal dezelfde', () => {
    const fout: string[] = []
    for (const t of ['fr', 'en'] as const)
      for (const [k, v] of Object.entries(woordenboek(t))) if (placeholders(k) !== placeholders(v)) fout.push(`${t}: ${k} → ${v}`)
    expect(fout).toEqual([])
  })
  it('vertaalt, vult in en valt terug op het Nederlands', () => {
    zetUiTaalVoorTest('fr')
    expect(tt('Taal')).toBe('Langue')
    expect(tt('Kamer {naam} wissen?', { naam: '12' })).not.toContain('{naam}')
    expect(tt('Iets wat niemand vertaalde')).toBe('Iets wat niemand vertaalde')
    zetUiTaalVoorTest('nl')
    expect(tt('Taal')).toBe('Taal')
  })
})
