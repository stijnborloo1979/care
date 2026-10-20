// Edge function: LifeAngle Voice — spraak naar tekst. OPTIONEEL.
//
// Twee toepassingen:
//   1. Browsers zonder eigen spraakherkenning (Firefox): de app neemt een
//      kort fragment op en laat het hier uitschrijven.
//   2. Het gesproken dagboek: lukte het meeluisteren tijdens de opname niet,
//      dan wordt de opname achteraf uitgeschreven.
//
// Zonder deze functie werkt alles nog: dan typt de gebruiker in Firefox,
// en wordt een dagboekopname bewaard zonder tekst.
//
// De audio wordt niet bewaard; alleen de tekst gaat terug naar de app.
//
// Transcriptie via Google Speech-to-Text op het EU-endpoint (zelfde route
// als spraak-vraag). Audio blijft binnen Europa en wordt niet bewaard.
//
// Secrets:
//   GOOGLE_SA_JSON     volledige JSON van het service account
//   STT_GOOGLE_MODEL   optioneel, standaard 'short'
//
// Verify JWT aan laten: alleen ingelogde gebruikers.

import { bytesNaarBase64, transcribeerEU } from '../_shared/stt.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 10 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    if (!req.headers.get('Authorization')) return json({ fout: 'niet_ingelogd' }, 401)
    const sa = JSON.parse(Deno.env.get('GOOGLE_SA_JSON') ?? 'null')
    if (!sa?.client_email || !sa?.private_key || !sa?.project_id) return json({ fout: 'geen_provider' }, 503)

    const form = await req.formData()
    const audio = form.get('audio')
    const taal = String(form.get('taal') ?? 'nl').slice(0, 2)
    if (!(audio instanceof File) || audio.size === 0) return json({ fout: 'geen_audio' }, 400)
    if (audio.size > MAX_BYTES) return json({ fout: 'te_groot' }, 413)

    const bytes = new Uint8Array(await audio.arrayBuffer())
    const tekst = await transcribeerEU(
      sa,
      bytesNaarBase64(bytes),
      ['nl', 'fr', 'en'].includes(taal) ? taal : 'nl',
      Deno.env.get('STT_GOOGLE_MODEL') ?? 'short',
    )
    return json({ tekst })
  } catch (e) {
    console.error('voice-transcribe', String(e).slice(0, 120))
    return json({ fout: 'intern' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
