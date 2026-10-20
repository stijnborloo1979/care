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
import { bouwRecognizeBody, geschatteBytes, leesTranscript, recognizeUrl, toegangsToken } from '../_shared/stt.ts'

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
