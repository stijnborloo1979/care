// Edge function: stuurt de uitnodigingsmail.
//
// Aanmaken kan zonder CLI: Dashboard -> Edge Functions -> Deploy a new
// function -> plak dit bestand.
//
// Secrets (Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY   sleutel van resend.com
//   MAIL_FROM        bv. Thuis <hallo@jouwdomein.be>
//   APP_URL          bv. https://thuis.netlify.app
//
// De client roept dit aan met de uitnodiging die create_invite() teruggaf.
// De functie verstuurt alleen; ze maakt zelf geen uitnodigingen aan, zodat
// de rechtencontrole in de database blijft waar ze hoort.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Niet ingelogd' }, 401)

    const { invite_id } = await req.json()
    if (!invite_id) return json({ error: 'invite_id ontbreekt' }, 400)

    // Met het token van de gebruiker: RLS bepaalt of deze persoon de
    // uitnodiging mag zien. Alleen de beheerder van het huishouden dus.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )

    const { data: invite, error } = await supabase
      .from('invitation')
      .select('email, token, expires_at, household_id, household:household_id (person_name)')
      .eq('id', invite_id)
      .maybeSingle()

    if (error) return json({ error: error.message }, 400)
    if (!invite) return json({ error: 'Uitnodiging niet gevonden' }, 404)

    const huis = Array.isArray(invite.household) ? invite.household[0] : invite.household
    const persoon = huis?.person_name ?? 'een familielid'
    const link = `${Deno.env.get('APP_URL')}/uitnodiging?token=${invite.token}`

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('MAIL_FROM'),
        to: invite.email,
        subject: `Je bent uitgenodigd om mee te zorgen voor ${persoon}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#221F1B">
            <h1 style="font-size:22px;margin:0 0 12px">Thuis</h1>
            <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
              Je bent uitgenodigd om mee te zorgen voor <strong>${persoon}</strong>.
              Thuis helpt om te weten wat er vandaag gepland staat, wie er komt en
              waar dingen liggen.
            </p>
            <p style="margin:24px 0">
              <a href="${link}" style="background:#8A5A1E;color:#fff;text-decoration:none;
                 padding:14px 24px;border-radius:999px;font-weight:600;display:inline-block">
                Uitnodiging aanvaarden
              </a>
            </p>
            <p style="font-size:14px;color:#5C554B;line-height:1.5">
              Deze link werkt alleen voor ${invite.email} en blijft geldig tot
              ${new Date(invite.expires_at).toLocaleDateString('nl-BE')}.
            </p>
          </div>`,
      }),
    })

    if (!mail.ok) return json({ error: `Mail versturen mislukte: ${await mail.text()}` }, 502)
    return json({ ok: true })
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
