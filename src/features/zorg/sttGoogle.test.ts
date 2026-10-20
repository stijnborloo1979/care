import { describe, expect, it } from 'vitest'
import {
  EU_ENDPOINT,
  bouwRecognizeBody,
  geschatteBytes,
  jwtDelen,
  leesTranscript,
  recognizeUrl,
  taalCode,
} from '../../../supabase/functions/spraak-vraag/stt'

describe('Google spraak (EU)', () => {
  it('gebruikt het EU-endpoint, niet het globale', () => {
    expect(EU_ENDPOINT).toBe('https://eu-speech.googleapis.com')
    expect(recognizeUrl('mijn-project')).toBe(
      'https://eu-speech.googleapis.com/v2/projects/mijn-project/locations/eu/recognizers/_:recognize',
    )
  })

  it('kiest de taal, met Nederlands als standaard', () => {
    expect(taalCode('nl')).toBe('nl-BE')
    expect(taalCode('fr')).toBe('fr-BE')
    expect(taalCode('de')).toBe('nl-BE')
  })

  it('bouwt de body zonder opslag-instellingen', () => {
    const body = bouwRecognizeBody('AAAA', 'nl', 'short')
    expect(body.content).toBe('AAAA')
    expect(body.config.languageCodes).toEqual(['nl-BE'])
    expect(body.config.model).toBe('short')
    expect(JSON.stringify(body)).not.toMatch(/logging|storage|bucket/i)
  })

  it('leest de tekst uit het antwoord', () => {
    const antwoord = { results: [{ alternatives: [{ transcript: ' Welke dienst is het nu ' }] }, { alternatives: [{ transcript: 'ok' }] }] }
    expect(leesTranscript(antwoord)).toBe('Welke dienst is het nu ok')
  })

  it('geeft leeg bij een leeg of ongeldig antwoord', () => {
    expect(leesTranscript({})).toBe('')
    expect(leesTranscript(null)).toBe('')
    expect(leesTranscript({ results: [{}] })).toBe('')
  })

  it('zet de geldigheid van het token op één uur', () => {
    const { payload } = jwtDelen('sa@project.iam.gserviceaccount.com', 1000)
    expect(payload.exp - payload.iat).toBe(3600)
    expect(payload.scope).toContain('cloud-platform')
  })

  it('rekent base64 terug naar bytes', () => {
    expect(geschatteBytes('AAAA')).toBe(3)
    expect(geschatteBytes('AA==')).toBe(1)
  })
})
