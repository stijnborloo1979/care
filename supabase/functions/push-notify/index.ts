// Edge function: stuurt de meldingen door, langs elke weg die openstaat.
//
// De database maakt meldingen (public.notification); deze functie bezorgt
// ze aan familie. Ze draait met de service role en mag dus niet publiek
// aanroepbaar zijn: laat "Verify JWT" AAN. Ze wordt aangeroepen door
// pg_cron (zie onderaan 20_push.sql) én rechtstreeks door de app, meteen
// nadat de persoon om terugbellen of om hulp vraagt — die twee mogen niet
// vijf minuten op een job wachten.
//
// Vier wegen, want één is niet betrouwbaar genoeg:
//
//   1. Realtime in de app. Niet hier: de app luistert zelf op de tabel
//      (useRealtime). Binnen een seconde, gratis, geen toestemming — maar
//      alleen zolang de app ergens open staat.
//   2. Push naar de browser. Snel en gratis, maar niet overal te krijgen:
//      op iPhone en iPad alleen wanneer de app op het beginscherm staat,
//      en een beheerde werklaptop kan het blokkeren.
//   3. WhatsApp of Telegram, voor niveau 'warn' en 'alert'. Komt op het
//      vergrendelscherm, ook met de app dicht. Per familielid in te stellen.
//   4. E-mail, voor dezelfde niveaus. Geen toestemming nodig en niets in te
//      stellen: dit is het vangnet onder alle andere.
//
// De wegen zijn onafhankelijk: een kapotte push houdt de rest niet tegen. De
// database beslist wie wat krijgt — pending_pushes en pending_alerts — en
// notification_delivery houdt per persoon per weg bij wat er weg is, zodat
// een fout bij één ontvanger de melding niet voor de anderen laat verdwijnen.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   Sleutels maken (eenmalig, waar dan ook met Node):
//     npx web-push generate-vapid-keys
//   De publieke sleutel gaat ook naar de app, als VITE_VAPID_PUBLIC_KEY.
//   VAPID_SUBJECT is een contactadres, bijvoorbeeld mailto:jij@example.be
//
// Per weg, alle optioneel. Ontbreekt er een, dan slaat de functie die weg
// over en zegt het antwoord welke uit staat:
//   e-mail    RESEND_API_KEY, MAIL_FROM, APP_URL  (zoals bij send-invite)
//   WhatsApp  WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE  (Meta Cloud API)
//   Telegram  TG_BOT_TOKEN
//
// Over WA_TEMPLATE: WhatsApp laat geen vrije tekst toe naar iemand die jou
// niet in de laatste 24 uur berichtte. Het sjabloon moet één variabele
// hebben ({{1}}), waar de tekst van de melding in komt. Bijvoorbeeld een
// utility-sjabloon met als inhoud: "Thuis: {{1}}".

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

interface AlertRij {
  notification_id: string
  profile_id: string
  kind: 'mail' | 'whatsapp' | 'telegram'
  address: string
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

  // Eerst de andere wegen, en los van de push. Stond dit erachter, dan hield
  // een lege pushlijst — het gewone geval bij iemand zonder toestemming — de
  // mail en de WhatsApp tegen, en dat is precies de situatie waarvoor die
  // bestaan.
  const post = await bezorgen(supabase)

  const { data, error } = await supabase.rpc('pending_pushes', { limiet: 200 })
  if (error) return new Response(error.message, { status: 500 })

  const rijen = (data ?? []) as Rij[]
  if (rijen.length === 0) {
    return json({ verstuurd: 0, meldingen: 0, ...post })
  }

  // Per melding tellen, niet per toestel: één melding gaat naar alle
  // toestellen van alle familieleden, en ze is pas bezorgd als ze overal
  // weg is. Werd ze afgevinkt zodra één toestel lukte, dan verdween ze
  // stil voor wie ze net niet kreeg.
  const teDoen = new Map<string, number>()
  const gelukt = new Map<string, number>()
  for (const r of rijen) teDoen.set(r.notification_id, (teDoen.get(r.notification_id) ?? 0) + 1)
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
      afvinken(gelukt, r.notification_id)
      verstuurd++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // 404 en 410: deze browser bestaat niet meer. Opruimen, niet opnieuw
      // proberen. Alle andere fouten: de melding blijft openstaan en gaat
      // bij de volgende draai mee.
      // 404 en 410 tellen als bezorgd: dit toestel bestaat niet meer, dus
      // wachten heeft geen zin. Alle andere fouten laten de melding open.
      if (code === 404 || code === 410) {
        wegGooien.add(r.subscription_id)
        afvinken(gelukt, r.notification_id)
      }
    }
  }

  for (const sub of wegGooien) {
    await supabase.rpc('drop_push_subscription', { sub })
  }

  const klaar = [...teDoen].filter(([id, n]) => gelukt.get(id) === n).map(([id]) => id)
  if (klaar.length > 0) {
    await supabase.rpc('mark_pushed', { ids: klaar })
  }

  return json({ verstuurd, meldingen: klaar.length, opgeruimd: wegGooien.size, ...post })
})

function afvinken(teller: Map<string, number>, id: string) {
  teller.set(id, (teller.get(id) ?? 0) + 1)
}

/**
 * De dringende meldingen langs elke weg die openstaat.
 *
 * Eén bericht per familielid per weg per melding. Geen bundeling: wie een
 * bericht krijgt met "3 meldingen", opent het later. Deze berichten komen
 * alleen bij iets dat niet kan wachten, en dat zijn er weinig — de database
 * houdt "bel me eens" tien minuten tegen en "ik heb hulp nodig" twee.
 *
 * Er wordt pas afgevinkt wat écht verstuurd is, per ontvanger en per weg.
 * Faalt WhatsApp bij Jan, dan blijft precies dat openstaan en gaat het de
 * volgende ronde mee; de mail naar Els is dan al bezorgd en wordt niet
 * herhaald.
 */
async function bezorgen(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('pending_alerts', { limiet: 100 })
  // Staat 36_kanalen.sql nog niet in de database, dan bestaat pending_alerts
  // niet. De push mag daar niet op stuklopen.
  if (error) return { wegen_fout: error.message }

  const rijen = (data ?? []) as AlertRij[]
  if (rijen.length === 0) return { bezorgd: 0 }

  const uit: string[] = []
  const gelukt: AlertRij[] = []
  const geteld: Record<string, number> = {}

  for (const r of rijen) {
    const weg = WEGEN[r.kind]
    if (!weg) continue
    if (!weg.aan()) {
      if (!uit.includes(r.kind)) uit.push(r.kind)
      continue
    }
    try {
      if (await weg.stuur(r)) {
        gelukt.push(r)
        geteld[r.kind] = (geteld[r.kind] ?? 0) + 1
      }
    } catch {
      // Blijft openstaan voor de volgende ronde.
    }
  }

  if (gelukt.length > 0) {
    await supabase.rpc('mark_alerts', {
      rijen: gelukt.map((r) => ({
        notification_id: r.notification_id,
        profile_id: r.profile_id,
        kind: r.kind,
      })),
    })
  }

  return {
    bezorgd: gelukt.length,
    per_weg: geteld,
    ...(uit.length > 0 ? { wegen_uit: uit } : {}),
  }
}

/**
 * De wegen, elk met dezelfde twee vragen: staat hij aan, en stuur dit.
 *
 * Eén vorm voor alle drie, zodat een vierde weg toevoegen hier één blok is
 * en niets anders in dit bestand raakt.
 */
const WEGEN: Record<
  AlertRij['kind'],
  { aan: () => boolean; stuur: (r: AlertRij) => Promise<boolean> }
> = {
  mail: {
    aan: () => !!Deno.env.get('RESEND_API_KEY') && !!Deno.env.get('MAIL_FROM'),
    stuur: async (r) => {
      const app = Deno.env.get('APP_URL') ?? ''
      const dringend = r.level === 'alert'
      const antwoord = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: Deno.env.get('MAIL_FROM'),
          to: r.address,
          subject: dringend ? `${r.person_name} heeft hulp nodig` : `Bericht over ${r.person_name}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#221F1B">
              <p style="font-size:20px;line-height:1.4;margin:0 0 16px;font-weight:600">
                ${ontsnap(r.body)}
              </p>
              ${
                dringend
                  ? `<p style="font-size:15px;color:#5C554B;margin:0 0 24px">
                       Dit is geen noodnummer. Bij gevaar bel je 112.
                     </p>`
                  : ''
              }
              ${
                app
                  ? `<p style="margin:0 0 24px">
                       <a href="${app}/familie" style="background:#8A5A1E;color:#fff;
                          text-decoration:none;padding:14px 24px;border-radius:999px;
                          font-weight:600;display:inline-block">Openen in Thuis</a>
                     </p>`
                  : ''
              }
              <p style="font-size:13px;color:#8A8377;margin:0">
                Je krijgt deze mail omdat pushmeldingen niet op elk toestel werken.
                Uitzetten kan bij Instellingen in Thuis.
              </p>
            </div>`,
        }),
      })
      return antwoord.ok
    },
  },

  whatsapp: {
    aan: () =>
      !!Deno.env.get('WA_TOKEN') && !!Deno.env.get('WA_PHONE_ID') && !!Deno.env.get('WA_TEMPLATE'),
    stuur: async (r) => {
      // Vrije tekst mag niet naar iemand die ons niet in de laatste 24 uur
      // berichtte, dus altijd het sjabloon. Eén variabele: de tekst van de
      // melding. WhatsApp weigert een variabele met een nieuwe regel of met
      // dubbele spaties, vandaar het opschonen.
      const tekst = r.body.replace(/\s+/g, ' ').trim().slice(0, 900)
      const antwoord = await fetch(
        `https://graph.facebook.com/v21.0/${Deno.env.get('WA_PHONE_ID')}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('WA_TOKEN')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: r.address,
            type: 'template',
            template: {
              name: Deno.env.get('WA_TEMPLATE'),
              language: { code: Deno.env.get('WA_TEMPLATE_TAAL') ?? 'nl' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: tekst }] },
              ],
            },
          }),
        },
      )
      return antwoord.ok
    },
  },

  telegram: {
    aan: () => !!Deno.env.get('TG_BOT_TOKEN'),
    stuur: async (r) => {
      const antwoord = await fetch(
        `https://api.telegram.org/bot${Deno.env.get('TG_BOT_TOKEN')}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: r.address,
            text: r.body,
            disable_notification: false,
          }),
        },
      )
      return antwoord.ok
    },
  },
}


/** Geen HTML uit een tekstveld laten ontsnappen, ook al schrijft de app ze zelf. */
function ontsnap(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}
