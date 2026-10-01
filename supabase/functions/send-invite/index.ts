// Edge function: stuurt de uitnodigingsmail.
//
// Aanmaken kan zonder CLI: Dashboard -> Edge Functions -> Deploy a new
// function -> plak dit bestand.
//
// Secrets (Dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY   sleutel van resend.com
//   MAIL_FROM        bv. LifeAngle <hallo@jouwdomein.be>
//   APP_URL          bv. https://lifeangle.pages.dev
//
// De client roept dit aan met de uitnodiging die create_invite() teruggaf.
// De functie verstuurt alleen; ze maakt zelf geen uitnodigingen aan, zodat
// de rechtencontrole in de database blijft waar ze hoort.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Niet ingelogd' }, 401)

    const body = await req.json().catch(() => ({}))
    const { invite_id, org_invite_id } = body as { invite_id?: string; org_invite_id?: string }
    if (!invite_id && !org_invite_id) return json({ error: 'invite_id ontbreekt' }, 400)

    // Met het token van de gebruiker: RLS bepaalt of deze persoon de
    // uitnodiging mag zien. Alleen de beheerder van het huishouden, of
    // (voor een medewerker) de beheerder van de organisatie.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )

    let bericht: Mail
    if (org_invite_id) {
      const { data: inv, error } = await supabase
        .from('org_invitation')
        .select('email, token, expires_at, role, organisation:org_id (name)')
        .eq('id', org_invite_id)
        .maybeSingle()
      if (error) return json({ error: error.message }, 400)
      if (!inv) return json({ error: 'Uitnodiging niet gevonden' }, 404)
      const org = Array.isArray(inv.organisation) ? inv.organisation[0] : inv.organisation
      bericht = medewerkerMail({
        email: inv.email,
        token: inv.token,
        expires_at: inv.expires_at,
        rol: inv.role,
        organisatie: org?.name ?? 'je woonzorgcentrum',
        app: Deno.env.get('APP_URL') ?? '',
      })
    } else {
      const { data: invite, error } = await supabase
        .from('invitation')
        .select('email, token, expires_at, household_id, household:household_id (person_name)')
        .eq('id', invite_id)
        .maybeSingle()

      if (error) return json({ error: error.message }, 400)
      if (!invite) return json({ error: 'Uitnodiging niet gevonden' }, 404)

      const huis = Array.isArray(invite.household) ? invite.household[0] : invite.household
      bericht = familieMail({
        email: invite.email,
        token: invite.token,
        expires_at: invite.expires_at,
        persoon: huis?.person_name ?? 'een familielid',
        app: Deno.env.get('APP_URL') ?? '',
      })
    }

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), ...bericht }),
    })

    if (!mail.ok) return json({ error: `Mail versturen mislukte: ${await mail.text()}` }, 502)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, 500)
  }
})

interface Mail {
  to: string
  subject: string
  html: string
}

function knop(link: string, tekst: string) {
  return `<p style="margin:24px 0">
      <a href="${link}" style="background:#8A5A1E;color:#fff;text-decoration:none;
         padding:14px 24px;border-radius:999px;font-weight:600;display:inline-block">${tekst}</a>
    </p>`
}

function ontsnap(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** De uitnodiging voor familie: inhoud zoals voorheen. */
export function familieMail(p: { email: string; token: string; expires_at: string; persoon: string; app: string }): Mail {
  const link = `${p.app}/uitnodiging?token=${p.token}`
  return {
    to: p.email,
    subject: `Je bent uitgenodigd om mee te zorgen voor ${p.persoon}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#221F1B">
        <h1 style="font-size:22px;margin:0 0 12px">LifeAngle</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
          Je bent uitgenodigd om mee te zorgen voor <strong>${ontsnap(p.persoon)}</strong>.
          LifeAngle helpt om te weten wat er vandaag gepland staat, wie er komt en
          waar dingen liggen.
        </p>
        ${knop(link, 'Uitnodiging aanvaarden')}
        <p style="font-size:14px;color:#5C554B;line-height:1.5">
          Deze link werkt alleen voor ${ontsnap(p.email)} en blijft geldig tot
          ${new Date(p.expires_at).toLocaleDateString('nl-BE')}.
        </p>
      </div>`,
  }
}

const ROL: Record<string, string> = {
  org_admin: 'beheerder',
  coordinator: 'coördinator',
  caregiver: 'zorgmedewerker',
}

/** De uitnodiging voor een medewerker van een woonzorgcentrum. */
export function medewerkerMail(p: {
  email: string
  token: string
  expires_at: string
  rol: string
  organisatie: string
  app: string
}): Mail {
  const link = `${p.app}/zorg/uitnodiging?token=${p.token}`
  return {
    to: p.email,
    subject: `${p.organisatie} nodigt je uit in LifeAngle Care`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#221F1B">
        <h1 style="font-size:22px;margin:0 0 12px">LifeAngle Care</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px">
          <strong>${ontsnap(p.organisatie)}</strong> nodigt je uit als ${ROL[p.rol] ?? 'medewerker'}.
          Je ziet er de bewoners die je volgt, de overdracht van je afdeling en de activiteiten.
        </p>
        ${knop(link, 'Uitnodiging aanvaarden')}
        <p style="font-size:14px;color:#5C554B;line-height:1.5">
          Deze link werkt alleen voor ${ontsnap(p.email)} en blijft geldig tot
          ${new Date(p.expires_at).toLocaleDateString('nl-BE')}.
        </p>
      </div>`,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
