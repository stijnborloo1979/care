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
// Secrets:
//   OPENAI_API_KEY
//   STT_MODEL      optioneel, standaard gpt-4o-mini-transcribe
//
// Verify JWT aan laten: alleen ingelogde gebruikers.

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
    const sleutel = Deno.env.get('OPENAI_API_KEY')
    if (!sleutel) return json({ fout: 'geen_provider' }, 503)

    const form = await req.formData()
    const audio = form.get('audio')
    const taal = String(form.get('taal') ?? 'nl').slice(0, 2)
    if (!(audio instanceof File) || audio.size === 0) return json({ fout: 'geen_audio' }, 400)
    if (audio.size > MAX_BYTES) return json({ fout: 'te_groot' }, 413)

    const uit = new FormData()
    uit.append('file', audio, audio.name || 'opname.webm')
    uit.append('model', Deno.env.get('STT_MODEL') ?? 'gpt-4o-mini-transcribe')
    if (['nl', 'fr', 'en'].includes(taal)) uit.append('language', taal)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sleutel}` },
      body: uit,
    })
    if (!res.ok) {
      console.error('voice-transcribe', res.status)
      return json({ fout: 'provider' }, 502)
    }
    const data = await res.json()
    return json({ tekst: typeof data.text === 'string' ? data.text.trim() : '' })
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
