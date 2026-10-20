// Zuivere hulpfuncties voor de Google Speech-to-Text-koppeling.
// Geen netwerk, geen secrets: alles hier is testbaar in vitest.

/** Het EU-endpoint van Google (multi-region). Data blijft binnen Europa. */
export const EU_ENDPOINT = 'https://eu-speech.googleapis.com'
export const EU_LOCATIE = 'eu'

const TAAL: Record<string, string> = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-US' }

export function taalCode(taal: string): string {
  return TAAL[taal.slice(0, 2)] ?? 'nl-BE'
}

/** Body voor projects.locations.recognizers.recognize (synchroon, geen opslag). */
export function bouwRecognizeBody(audioBase64: string, taal: string, model: string) {
  return {
    config: {
      autoDecodingConfig: {},
      languageCodes: [taalCode(taal)],
      model,
      features: { enableAutomaticPunctuation: true },
    },
    content: audioBase64,
  }
}

export function recognizeUrl(project: string): string {
  // Standaard recognizer '_' met inline config.
  return `${EU_ENDPOINT}/v2/projects/${project}/locations/${EU_LOCATIE}/recognizers/_:recognize`
}

/** Haalt de tekst uit het antwoord; leeg als er niets herkend is. */
export function leesTranscript(antwoord: unknown): string {
  const results = (antwoord as { results?: { alternatives?: { transcript?: string }[] }[] } | null)?.results ?? []
  const delen = results
    .map((r) => r.alternatives?.[0]?.transcript ?? '')
    .map((t) => t.trim())
    .filter(Boolean)
  return delen.join(' ').trim()
}

/** Opbouw van het JWT-header en payload voor het ophalen van een toegangstoken. */
export function jwtDelen(clientEmail: string, nu: number) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nu,
    exp: nu + 3600,
  }
  return { header, payload }
}

/** Bytes van een base64-string, voor de audio-lengtecontrole. */
export function geschatteBytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - pad
}
