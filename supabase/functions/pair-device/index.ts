// Edge function: koppelt een tablet aan een huishouden met een code.
//
// Aanmaken zonder CLI: Dashboard -> Edge Functions -> Deploy a new function
// -> naam "pair-device" -> plak dit bestand.
//
// BELANGRIJK: zet "Verify JWT" UIT voor deze functie. De tablet is op dat
// moment nog niet ingelogd — daar dient deze functie net voor. De
// beveiliging zit in de code zelf: acht cijfers, tien minuten geldig,
// eenmalig, en een rem op het aantal pogingen.
//
// Hoe het werkt: de functie zoekt (of maakt) het account van de persoon,
// laat Supabase een eenmalige inlogsleutel maken, en geeft die terug. De
// tablet wisselt die sleutel in voor een sessie. Er wordt nooit een
// wachtwoord aangemaakt of verstuurd.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_POGINGEN_PER_KWARTIER = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'onbekend'

  try {
    // Rem op raden: te veel mislukte pogingen vanaf één adres, en het stopt.
    const { count } = await admin
      .from('pairing_attempt')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('succeeded', false)
      .gte('at', new Date(Date.now() - 15 * 60_000).toISOString())

    if ((count ?? 0) >= MAX_POGINGEN_PER_KWARTIER) {
      return json({ error: 'Te veel pogingen. Wacht een kwartier en probeer opnieuw.' }, 429)
    }

    const { code } = await req.json()
    const schoon = String(code ?? '').replace(/\D/g, '')

    const { data: koppeling } = await admin
      .from('device_pairing')
      .select('id, household_id, expires_at, used_at')
      .eq('code', schoon)
      .maybeSingle()

    const geldig =
      koppeling && !koppeling.used_at && new Date(koppeling.expires_at).getTime() > Date.now()

    await admin.from('pairing_attempt').insert({ ip, succeeded: !!geldig })

    if (!geldig) {
      return json({ error: 'Deze code klopt niet of is verlopen. Vraag een nieuwe.' }, 400)
    }

    const hh = koppeling!.household_id

    // Heeft dit huishouden al een account voor de persoon?
    const { data: bestaand } = await admin
      .from('membership')
      .select('profile_id')
      .eq('household_id', hh)
      .eq('role', 'person')
      .limit(1)
      .maybeSingle()

    let email: string

    if (bestaand?.profile_id) {
      const { data: u, error } = await admin.auth.admin.getUserById(bestaand.profile_id)
      if (error || !u.user?.email) throw error ?? new Error('Account niet gevonden')
      email = u.user.email
    } else {
      // Een account zonder mailbox. Het adres is alleen een sleutel: de
      // .invalid-extensie is gereserveerd en kan nooit echt bestaan, dus
      // er kan ook nooit per ongeluk een mail naartoe.
      const { data: huis } = await admin
        .from('household')
        .select('person_name')
        .eq('id', hh)
        .single()

      email = `tablet-${hh.slice(0, 8)}-${crypto.randomUUID().slice(0, 6)}@thuis.invalid`

      const { data: nieuw, error: maakFout } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: huis?.person_name ?? 'Persoon' },
      })
      if (maakFout || !nieuw.user) throw maakFout ?? new Error('Account aanmaken mislukt')

      await admin
        .from('profile')
        .upsert({ id: nieuw.user.id, full_name: huis?.person_name ?? 'Persoon' })

      await admin
        .from('membership')
        .insert({ household_id: hh, profile_id: nieuw.user.id, role: 'person' })

      // De kaart "Dit ben jij" koppelen aan dit account.
      await admin
        .from('person_card')
        .update({ profile_id: nieuw.user.id })
        .eq('household_id', hh)
        .eq('kind', 'self')
        .is('profile_id', null)
    }

    // Een eenmalige inlogsleutel. Er wordt geen mail verstuurd: we geven
    // de sleutel rechtstreeks terug aan de tablet.
    const { data: link, error: linkFout } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkFout || !link.properties?.hashed_token) {
      throw linkFout ?? new Error('Inlogsleutel maken mislukt')
    }

    await admin
      .from('device_pairing')
      .update({ used_at: new Date().toISOString() })
      .eq('id', koppeling!.id)

    await admin.from('care_log').insert({
      household_id: hh,
      title: 'Tablet gekoppeld',
      source: 'system',
    })

    return json({ token_hash: link.properties.hashed_token })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Koppelen mislukt' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
