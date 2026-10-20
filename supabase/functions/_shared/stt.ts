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

/** Haalt een toegangstoken op met een ondertekende JWT (service account). */
export async function toegangsToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const { header, payload } = jwtDelen(sa.client_email, Math.floor(Date.now() / 1000))
  const invoer = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sleutel = await crypto.subtle.importKey(
    'pkcs8',
    pemNaarBytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const handtekening = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', sleutel, new TextEncoder().encode(invoer))
  const jwt = `${invoer}.${b64urlBytes(new Uint8Array(handtekening))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`token ${res.status}`)
  const data = await res.json()
  return data.access_token as string
}

/** Transcribeer audio (base64) op het EU-endpoint. Alleen de tekst komt terug. */
export async function transcribeerEU(
  sa: { client_email: string; private_key: string; project_id: string },
  audioBase64: string,
  taal: string,
  model: string,
): Promise<string> {
  const token = await toegangsToken(sa)
  const res = await fetch(recognizeUrl(sa.project_id), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(bouwRecognizeBody(audioBase64, taal, model)),
  })
  if (!res.ok) throw new Error(`stt ${res.status}`)
  return leesTranscript(await res.json())
}

export function pemNaarBytes(pem: string): ArrayBuffer {
  const schoon = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(schoon)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function b64url(tekst: string): string {
  return b64urlBytes(new TextEncoder().encode(tekst))
}

export function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function bytesNaarBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
