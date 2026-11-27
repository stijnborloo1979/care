import { describe, expect, it } from 'vitest'
import { ledUrl } from './ledbalk'

describe('ledbalk', () => {
  it('geeft per signaal de afgesproken kleur', () => {
    expect(ledUrl('bericht')).toBe('http://127.0.0.1:8765/led?kleur=0050ff')
    expect(ledUrl('medicatie')).toBe('http://127.0.0.1:8765/led?kleur=ff7800')
    expect(ledUrl('afspraak')).toBe('http://127.0.0.1:8765/led?kleur=ff7800')
    expect(ledUrl('oproep')).toBe('http://127.0.0.1:8765/led?kleur=00c050&knipper=1')
  })
  it('dooft de leds als het licht dooft', () => {
    expect(ledUrl(null)).toBe('http://127.0.0.1:8765/led?kleur=uit')
  })
})
