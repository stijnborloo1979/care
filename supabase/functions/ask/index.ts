// Edge function: beantwoordt een vraag uit de eigen gegevens.
//
// Dit is laag drie. De app probeert eerst haar eigen regels (zie
// answerEngine.ts); pas als die niets vinden, komt deze functie aan bod.
//
// De belangrijkste regel staat in de systeemprompt én in de code: vindt
// de vectorzoektocht niets boven de drempel, dan wordt het model niet
// eens aangeroepen. Geen treffers betekent "dat weet ik niet zeker" —
// nooit een gok.
//
// Secrets: OPENAI_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GEEN_ANTWOORD = {
  titel: 'Dat weet ik niet zeker.',
  regels: ['Wil je het aan je familie vragen?'],
  bronnen: [],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Niet ingelogd' }, 401)

    const { household_id, vraag } = await req.json()
    if (!household_id || !vraag) return json({ error: 'household_id of vraag ontbreekt' }, 400)

    // Met het token van de gebruiker: match_memory controleert zelf of
    // deze persoon lid is van het huishouden.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )

    const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: vraag }),
    })
    if (!embedRes.ok) return json(GEEN_ANTWOORD)

    const vec = (await embedRes.json()).data?.[0]?.embedding
    if (!vec) return json(GEEN_ANTWOORD)

    const { data: treffers, error } = await supabase.rpc('match_memory', {
      hh: household_id,
      query_embedding: JSON.stringify(vec),
      drempel: 0.78,
      aantal: 4,
    })

    if (error || !treffers || treffers.length === 0) return json(GEEN_ANTWOORD)

    const context = (treffers as { titel: string; tekst: string }[])
      .map((t, i) => `[${i + 1}] ${t.titel}: ${t.tekst}`)
      .join('\n')

    const chat = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'Je helpt iemand met geheugenproblemen. Antwoord in het Nederlands, in ' +
              'hoogstens twee korte zinnen, in eenvoudige taal en in de je-vorm. ' +
              'Gebruik uitsluitend de gegeven informatie. Staat het antwoord er niet bij, ' +
              'antwoord dan exact: Dat weet ik niet zeker. Voeg nooit iets toe, gok nooit, ' +
              'en verzin geen namen, tijden of plaatsen.',
          },
          { role: 'user', content: `Informatie:\n${context}\n\nVraag: ${vraag}` },
        ],
      }),
    })

    if (!chat.ok) return json(GEEN_ANTWOORD)

    const tekst = (await chat.json()).choices?.[0]?.message?.content?.trim()
    if (!tekst || tekst.startsWith('Dat weet ik niet zeker')) return json(GEEN_ANTWOORD)

    return json({
      titel: tekst,
      regels: [],
      // Waar het antwoord vandaan komt. De persoon ziet zo dat het van
      // familie komt en niet uit het niets.
      bronnen: (treffers as { titel: string }[]).map((t) => t.titel),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
