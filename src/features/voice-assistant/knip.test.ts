import { describe, expect, it } from 'vitest'
import { encodeWav, knipSamples, SPRAAK_RATE, STUK_SECONDEN } from './knip'

describe('knipSamples', () => {
  it('knipt in stukken van de gevraagde lengte, het laatste stuk is de rest', () => {
    const stukken = knipSamples(new Float32Array(25), 10)
    expect(stukken.map((s) => s.length)).toEqual([10, 10, 5])
  })

  it('één stuk als de opname korter is dan het stuk', () => {
    expect(knipSamples(new Float32Array(3), 10).length).toBe(1)
  })

  it('geen stukken bij een lege opname', () => {
    expect(knipSamples(new Float32Array(0), 10)).toEqual([])
  })

  it('blijft onder de limiet van één minuut', () => {
    expect(STUK_SECONDEN).toBeLessThan(60)
    expect(SPRAAK_RATE * STUK_SECONDEN * 2).toBeLessThan(10 * 1024 * 1024)
  })
})

describe('encodeWav', () => {
  it('schrijft een geldige 16-bit mono WAV-kop', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 16000)
    const v = new DataView(wav)
    const tekst = (pos: number, n: number) => String.fromCharCode(...new Uint8Array(wav, pos, n))
    expect(tekst(0, 4)).toBe('RIFF')
    expect(tekst(8, 4)).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(8) // 4 samples × 2 bytes
    expect(wav.byteLength).toBe(44 + 8)
  })
})
