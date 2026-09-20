// Edge function: berekent embeddings voor weetjes en dingen.
//
// Plan deze elke nacht in, na run_nightly(). Ze verwerkt wat nog geen
// embedding heeft en stopt daarna; grote achterstanden worden zo over
// meerdere nachten weggewerkt zonder ooit lang te draaien.
//
// Secrets: OPENAI_API_KEY
// Deze functie draait met de service role en moet dus NIET publiek
// aanroepbaar zijn: zet "Verify JWT" aan en roep haar aan vanuit pg_cron
// of een scheduled trigger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: rijen, error } = await supabase.rpc('pending_embeddings', { limiet: 50 })
  if (error) return new Response(error.message, { status: 500 })
  if (!rijen || rijen.length === 0) return new Response(JSON.stringify({ verwerkt: 0 }))

  let verwerkt = 0

  for (const rij of rijen as { soort: string; id: string; tekst: string }[]) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: rij.tekst }),
    })
    if (!res.ok) break

    const json = await res.json()
    const vec = json.data?.[0]?.embedding
    if (!vec) break

    const { error: setError } = await supabase.rpc('set_embedding', {
      soort: rij.soort,
      rij_id: rij.id,
      vec: JSON.stringify(vec),
    })
    if (setError) break
    verwerkt++
  }

  return new Response(JSON.stringify({ verwerkt }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
