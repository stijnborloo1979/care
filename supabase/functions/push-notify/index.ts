// Edge function: stuurt de meldingen van de nachtjob door als pushbericht.
//
// De database maakt meldingen (public.notification); deze functie stuurt
// ze naar de toestellen van familie. Ze draait met de service role en mag
// dus niet publiek aanroepbaar zijn: laat "Verify JWT" AAN en roep ze aan
// vanuit pg_cron met pg_net (zie onderaan 20_push.sql), elke vijf minuten.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   Sleutels maken (eenmalig, waar dan ook met Node):
//     npx web-push generate-vapid-keys
//   De publieke sleutel gaat ook naar de app, als VITE_VAPID_PUBLIC_KEY.
//   VAPID_SUBJECT is een contactadres, bijvoorbeeld mailto:jij@example.be
//
// Wie een melding krijgt, beslist de database (pending_pushes): alleen
// familie, alleen in de fase "ondersteund", alleen op toestellen die
// zelf toestemden.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface Rij {
  notification_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_key: string
  level: string
  body: string
  person_name: string
}

Deno.serve(async () => {
  const publiek = Deno.env.get('VAPID_PUBLIC_KEY')
  const prive = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publiek || !prive) {
    return new Response('VAPID-sleutels ontbreken', { status: 500 })
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:thuis@example.be',
    publiek,
    prive,
  )

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('pending_pushes', { limiet: 200 })
  if (error) return new Response(error.message, { status: 500 })

  const rijen = (data ?? []) as Rij[]
  if (rijen.length === 0) {
    return json({ verstuurd: 0, meldingen: 0 })
  }

  const gelukt = new Set<string>()
  const wegGooien = new Set<string>()
  let verstuurd = 0

  for (const r of rijen) {
    try {
      await webpush.sendNotification(
        {
          endpoint: r.endpoint,
          keys: { p256dh: r.p256dh, auth: r.auth_key },
        },
        JSON.stringify({
          titel: r.person_name,
          body: r.body,
          level: r.level,
          url: '/familie',
        }),
        // Een melding die pas na een halve dag aankomt, klopt niet meer.
        { TTL: 3 * 3600, urgency: r.level === 'alert' ? 'high' : 'normal' },
      )
      gelukt.add(r.notification_id)
      verstuurd++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // 404 en 410: deze browser bestaat niet meer. Opruimen, niet opnieuw
      // proberen. Alle andere fouten: de melding blijft openstaan en gaat
      // bij de volgende draai mee.
      if (code === 404 || code === 410) {
        wegGooien.add(r.subscription_id)
        gelukt.add(r.notification_id)
      }
    }
  }

  for (const sub of wegGooien) {
    await supabase.rpc('drop_push_subscription', { sub })
  }

  if (gelukt.size > 0) {
    await supabase.rpc('mark_pushed', { ids: [...gelukt] })
  }

  return json({ verstuurd, meldingen: gelukt.size, opgeruimd: wegGooien.size })
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}
