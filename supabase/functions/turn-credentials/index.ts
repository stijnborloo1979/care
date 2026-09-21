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
//   Naam: turn-credentials. "Verify JWT" mag AAN blijven: alleen wie
//   ingelogd is, krijgt gegevens.
//
// Secrets (Edge Functions -> Secrets):
//   CF_TURN_KEY_ID      de Key ID van je TURN-sleutel bij Cloudflare
//   CF_TURN_API_TOKEN   het API-token van die sleutel
//
// Staan die niet ingesteld, dan geeft de functie niets terug en valt de
// app terug op alleen STUN: bellen werkt dan op wifi, maar niet overal.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
