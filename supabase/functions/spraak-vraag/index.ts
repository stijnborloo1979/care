// Edge function: spraakvraag via Google Speech-to-Text (EU-endpoint).
//
// Stroom:
//   1. Ingelogde medewerker stuurt een korte opname (base64) en een soort vraag.
//   2. Met de eigen token wordt spraak_vraag_registreren aangeroepen. Dat
//      controleert de organisatie- en persoonsschakelaar en legt alleen het
//      soort vraag vast (migratie 104).
//   3. Pas daarna gaat de audio naar het EU-endpoint van Google, synchroon.
//   4. Alleen de herkende tekst komt terug. Audio en tekst worden niet
//      opgeslagen en niet gelogd.
//
// Secrets (niet in de repo):
//   GOOGLE_SA_JSON     volledige JSON van het service account
//   STT_GOOGLE_MODEL   optioneel, standaard 'short' (controleer in de console)
//   SUPABASE_URL, SUPABASE_ANON_KEY  staan standaard klaar

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  bouwRecognizeBody,
  geschatteBytes,
  jwtDelen,
  leesTranscript,
  recognizeUrl,
} from './stt.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 2 * 1024 * 1024 // korte vragen; ruim boven 10 seconden audio

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ fout: 'niet_ingelogd' }, 401)

    const invoer = await req.json().catch(() => null) as
      | { org?: string; soort?: string; audio?: string; taal?: string }
      | null
    if (!invoer?.org || !invoer.audio) return json({ fout: 'ongeldige_invoer' }, 400)
    if (invoer.soort !== 'tijd_dienst' && invoer.soort !== 'open_taken') {
      return json({ fout: 'ongeldige_invoer' }, 400)
    }
    if (geschatteBytes(invoer.audio) > MAX_BYTES) return json({ fout: 'te_groot' }, 413)

    // 1 en 2: schakelaars en logging, met de token van de medewerker.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: mag, error: fout } = await supabase.rpc('spraak_vraag_registreren', {
      org: invoer.org,
      soort: invoer.soort,
    })
    if (fout) {
      console.error('spraak-vraag rpc', fout.code ?? 'onbekend')
      return json({ fout: 'intern' }, 500)
    }
    if (mag !== true) return json({ fout: 'uit' }, 403)

    // 3: transcriptie op het EU-endpoint.
    const sa = JSON.parse(Deno.env.get('GOOGLE_SA_JSON') ?? 'null')
    if (!sa?.client_email || !sa?.private_key || !sa?.project_id) {
      return json({ fout: 'geen_provider' }, 503)
    }
    const token = await toegangsToken(sa)
    const res = await fetch(recognizeUrl(sa.project_id), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        bouwRecognizeBody(invoer.audio, invoer.taal ?? 'nl', Deno.env.get('STT_GOOGLE_MODEL') ?? 'short'),
      ),
    })
    if (!res.ok) {
      console.error('spraak-vraag stt', res.status)
      return json({ fout: 'provider' }, 502)
    }
    // 4: alleen de tekst gaat terug.
    return json({ tekst: leesTranscript(await res.json()) })
  } catch (e) {
    console.error('spraak-vraag', String(e).slice(0, 120))
    return json({ fout: 'intern' }, 500)
  }
})

async function toegangsToken(sa: { client_email: string; private_key: string }): Promise<string> {
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

function pemNaarBytes(pem: string): ArrayBuffer {
  const schoon = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(schoon)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function b64url(tekst: string): string {
  return b64urlBytes(new TextEncoder().encode(tekst))
}

function b64urlBytes(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
