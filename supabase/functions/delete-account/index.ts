// Edge function: verwijdert een account, en waar nodig het huishouden.
//
// Het recht op vergetelheid uit de AVG. Een account verwijderen kan alleen
// met de service role, en die hoort nooit in de browser — vandaar deze
// functie.
//
// Aanmaken: Dashboard -> Edge Functions -> Deploy a new function.
//   Naam: delete-account. "Verify JWT" AAN laten: alleen wie ingelogd is,
//   kan zijn eigen account verwijderen, en nooit dat van iemand anders.
//
// Wat er gebeurt met een huishouden:
//   - Ben jij de persoon over wie het gaat, dan verdwijnt het huishouden
//     mee. Het zijn jouw gegevens.
//   - Ben je er alleen, dan verdwijnt het ook.
//   - Is er nog een andere beheerder, dan blijft het bestaan; alleen jij
//     verdwijnt eruit. Wat je schreef, blijft staan zonder je naam.
//   - Ben je de enige beheerder en zijn er nog anderen, dan stopt de
//     functie en vraagt ze om eerst iemand anders beheerder te maken — tenzij
//     je uitdrukkelijk kiest om het huishouden mee te verwijderen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKETS = ['avatars', 'home-memory', 'memories', 'documents', 'messages']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Niet ingelogd' }, 401)

    // Wie vraagt dit? Uit het eigen token, nooit uit de vraag zelf.
    const gebruikerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: wie } = await gebruikerClient.auth.getUser()
    const uid = wie.user?.id
    if (!uid) return json({ error: 'Niet ingelogd' }, 401)

    const { verwijderHuishoudens } = await req.json().catch(() => ({ verwijderHuishoudens: false }))

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data: leden } = await admin
      .from('membership')
      .select('household_id, role, household:household_id (person_name)')
      .eq('profile_id', uid)

    const teVerwijderen: string[] = []

    for (const lid of leden ?? []) {
      const hh = lid.household_id as string
      const naam = (Array.isArray(lid.household) ? lid.household[0] : lid.household)?.person_name

      const { data: zelf } = await admin
        .from('person_card')
        .select('id')
        .eq('household_id', hh)
        .eq('kind', 'self')
        .eq('profile_id', uid)
        .maybeSingle()

      const { data: anderen } = await admin
        .from('membership')
        .select('profile_id, role')
        .eq('household_id', hh)
        .neq('profile_id', uid)

      const andereBeheerder = (anderen ?? []).some((a) => a.role === 'admin')

      if (zelf || (anderen ?? []).length === 0) {
        teVerwijderen.push(hh)
      } else if (lid.role === 'admin' && !andereBeheerder) {
        if (verwijderHuishoudens) {
          teVerwijderen.push(hh)
        } else {
          return json(
            {
              error: `Je bent de enige beheerder van het huishouden van ${naam}. Maak eerst iemand anders beheerder (onder "Wie ziet wat"), of kies om het huishouden mee te verwijderen.`,
              huishouden: naam,
            },
            409,
          )
        }
      }
    }

    for (const hh of teVerwijderen) {
      for (const bucket of BUCKETS) await wisMap(admin, bucket, hh)
      // Alles wat aan het huishouden hangt, verdwijnt mee (on delete cascade).
      const { error } = await admin.from('household').delete().eq('id', hh)
      if (error) throw error
    }

    // Het account zelf. Profiel en lidmaatschappen verdwijnen mee.
    const { error: fout } = await admin.auth.admin.deleteUser(uid)
    if (fout) throw fout

    return json({ ok: true, huishoudensVerwijderd: teVerwijderen.length })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Verwijderen mislukt' }, 500)
  }
})

// deno-lint-ignore no-explicit-any
async function wisMap(admin: any, bucket: string, prefix: string) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (!data || data.length === 0) return
  const bestanden: string[] = []
  const mappen: string[] = []
  for (const o of data) {
    // Mappen hebben geen id; bestanden wel.
    if (o.id) bestanden.push(`${prefix}/${o.name}`)
    else mappen.push(`${prefix}/${o.name}`)
  }
  if (bestanden.length > 0) await admin.storage.from(bucket).remove(bestanden)
  for (const m of mappen) await wisMap(admin, bucket, m)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
