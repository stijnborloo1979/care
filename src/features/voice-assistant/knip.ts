// Zuivere hulpfuncties om een opname in stukken te knippen en als WAV te coderen.
// Google accepteert synchroon maximaal één minuut audio, dus we knippen op 50 seconden.

export const SPRAAK_RATE = 16000
export const STUK_SECONDEN = 50

/** Knipt mono samples in stukken van ten hoogste `stukSamples` lang. */
export function knipSamples(samples: Float32Array, stukSamples: number): Float32Array[] {
  if (stukSamples <= 0) throw new Error('stukSamples moet positief zijn')
  const stukken: Float32Array[] = []
  for (let start = 0; start < samples.length; start += stukSamples) {
    stukken.push(samples.subarray(start, Math.min(start + stukSamples, samples.length)))
  }
  return stukken
}

/** Codeert mono float-samples als 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const dataBytes = samples.length * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const v = new DataView(buf)
  const schrijf = (pos: number, tekst: string) => {
    for (let i = 0; i < tekst.length; i++) v.setUint8(pos + i, tekst.charCodeAt(i))
  }
  schrijf(0, 'RIFF')
  v.setUint32(4, 36 + dataBytes, true)
  schrijf(8, 'WAVE')
  schrijf(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  schrijf(36, 'data')
  v.setUint32(40, dataBytes, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}
