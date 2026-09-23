// Edge function: tijdelijke TURN-gegevens voor videobellen.
//
// Zonder TURN lukt bellen niet op 4G of 5G: daar delen veel klanten één
// publiek adres, en kan een toestel niet rechtstreeks bereikt worden. Een
// TURN-server geeft het beeld dan door. Het blijft versleuteld van toestel
// tot toestel — de server kan niets zien of horen.
//
// Deze functie gebruikt de TURN-dienst van Cloudflare. Geen server om zelf
// te beheren, en je werkt toch al in het Cloudflare-dashboard.
//
// Aanmaken: Dashboard -> Edge Functions -> Deploy a new function
//   Naam: turn-credentials
//
//   Zet "Verify JWT" UIT voor deze functie. Met die schakelaar aan
//   weigert Supabase de preflight-vraag van de browser (een OPTIONS
//   zonder token) nog voor deze code draait, en dan geeft de browser een
//   CORS-fout. De controle gebeurt hieronder zelf: zonder geldig token
//   krijgt niemand gegevens.
//
// Secrets (Edge Functions -> Secrets):
//   CF_TURN_KEY_ID      de Turn Token ID van je TURN-sleutel bij Cloudflare
//   CF_TURN_API_TOKEN   het API-token van die sleutel
//
// Staan die niet ingesteld, dan geeft de functie niets terug en valt de
// app terug op alleen STUN: bellen werkt dan op wifi, maar niet overal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Wie ben je? Zonder geldig token geen TURN-gegevens: anders kan iedereen
  // met het adres van deze functie verkeer over jouw Cloudflare-account
  // laten lopen.
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return json({ iceServers: null, error: 'niet ingelogd' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: gebruiker } = await supabase.auth.getUser(jwt)
  if (!gebruiker?.user) return json({ iceServers: null, error: 'niet ingelogd' }, 401)

  const keyId = Deno.env.get('CF_TURN_KEY_ID')
  const token = Deno.env.get('CF_TURN_API_TOKEN')
  if (!keyId || !token) return json({ iceServers: null })

  const basis = `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials`
  const opties = {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // Een dag geldig: lang genoeg voor elk gesprek, kort genoeg om niet te
    // lekken als iemand de gegevens zou onderscheppen.
    body: JSON.stringify({ ttl: 86400 }),
  }

  try {
    // Cloudflare heeft twee varianten van dit adres gehad; we proberen de
    // nieuwe eerst en vallen terug op de oude.
    let res = await fetch(`${basis}/generate-ice-servers`, opties)
    if (!res.ok) res = await fetch(`${basis}/generate`, opties)
    if (!res.ok) return json({ iceServers: null, error: await res.text() })

    const body = await res.json()
    const lijst = Array.isArray(body.iceServers)
      ? body.iceServers
      : body.iceServers
        ? [body.iceServers]
        : null

    return json({ iceServers: lijst })
  } catch (e) {
    return json({ iceServers: null, error: e instanceof Error ? e.message : 'onbekend' })
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
