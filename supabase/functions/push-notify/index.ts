// Edge function: stuurt de meldingen door, langs elke weg die openstaat.
//
// LET OP bij het deployen: zet "Verify JWT" UIT voor deze functie. Met die
// schakelaar aan weigert de poortwachter van Supabase het OPTIONS-verzoek van
// de browser, want dat draagt geen token — en dan werkt geen enkele aanroep
// vanuit de app. De controle gebeurt in de functie zelf (magBinnen), en is
// daar even streng.
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

/**
 * De browser vraagt eerst toestemming (een OPTIONS-verzoek) voor hij een
 * POST doet. Kwam daar geen antwoord met deze koppen op, dan blokkeerde
 * Chrome het echte verzoek en zag je alleen "net::ERR_FAILED" — terwijl de
 * functie zelf niets verkeerd deed.
 *
 * Dit stond er niet in omdat push-notify oorspronkelijk alleen door pg_cron
 * werd aangeroepen, en een cronjob vraagt niets vooraf. Sinds de app haar
 * rechtstreeks aanroept — voor "bel me eens", voor de testmelding en voor de
 * Telegram-chats — moet het er wel bij.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Alles binnen één vangnet, want een onbehandelde fout geeft een kale 500
  // zonder CORS-koppen — en dan ziet de browser opnieuw een CORS-fout en zoek
  // je op de verkeerde plaats. Liever een 500 die zegt wat er misging.
  try {
    return await behandel(req)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Onbekende fout' }, 500)
  }
})

async function behandel(req: Request): Promise<Response> {
  // Zet "Verify JWT" UIT voor deze functie, en lees hieronder waarom dat
  // veilig is.
  if (!(await magBinnen(req))) {
    return json({ error: 'Niet ingelogd' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Eén kleine uitzondering op "deze functie verstuurt alleen": de app kan
  // hier vragen welke chats de Telegram-bot recent aanschreven. Zonder dat
  // heeft een familielid geen enkele manier om zijn chat-id te weten te
  // komen — de bot antwoordt niet uit zichzelf.
  if (await vraagtTelegramChats(req)) return json({ chats: await telegramChats() })

  // Alle wegen, elk los van de andere. Eerst de kanalen, dan de push: stond
  // dit omgekeerd, dan hield een lege pushlijst — het gewone geval bij
  // iemand zonder toestemming — de mail en de WhatsApp tegen, en dat is
  // precies de situatie waarvoor die bestaan.
  const post = await bezorgen(supabase)
  const push = await pushen(supabase)
  return json({ ...push, ...post })
}

/**
 * Wie mag deze functie aanroepen?
 *
 * "Verify JWT" moet hier UIT staan, en dat is geen slordigheid maar de enige
 * werkbare keuze: met die schakelaar aan weigert de poortwachter van Supabase
 * élk verzoek zonder Authorization-header — óók het OPTIONS-verzoek waarmee
 * de browser vooraf toestemming vraagt. Een preflight stuurt nooit een token
 * mee. Gevolg: de functie wordt nooit bereikt, de CORS-koppen hieronder komen
 * niet aan bod, en Chrome zegt alleen "preflight does not have HTTP ok
 * status". Dat heeft een avond gekost.
 *
 * De controle verhuist dus naar hier, waar ze net zo streng is:
 *
 *   - de service role (pg_cron, via pg_net) mag binnen;
 *   - een ingelogde gebruiker mag binnen, gecontroleerd bij Supabase zelf;
 *   - al de rest niet.
 *
 * Dat is geen verzwakking tegenover "Verify JWT": die schakelaar doet exact
 * hetzelfde, alleen een laag hoger en zonder onderscheid voor OPTIONS.
 */
async function magBinnen(req: Request): Promise<boolean> {
  const kop = req.headers.get('Authorization') ?? ''
  const token = kop.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  // De cron roept aan met de service role key. Die hoort niet naar
  // auth.getUser(): het is geen gebruiker.
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (service && token === service) return true

  try {
    // Bewust met de service role en het token als argument, niet met de anon
    // key in een client. Die anon key heet niet in elk project hetzelfde, en
    // createClient() met een lege sleutel gooit meteen — wat de hele functie
    // een 500 gaf, zonder CORS-koppen, en dus opnieuw als een CORS-fout in
    // beeld kwam. getUser(token) laat Supabase het token nakijken en heeft
    // verder niets nodig.
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data, error } = await client.auth.getUser(token)
    return !error && !!data?.user
  } catch {
    return false
  }
}

/** Komt er een verzoek om de Telegram-chats, of is dit een gewone ronde? */
async function vraagtTelegramChats(req: Request): Promise<boolean> {
  if (req.method !== 'POST') return false
  try {
    const body = await req.json()
    return body?.actie === 'telegram-chats'
  } catch {
    // pg_cron stuurt geen body. Dat is de gewone ronde.
    return false
  }
}

/**
 * Wie stuurde de bot recent iets?
 *
 * Telegram geeft een chat-id pas prijs wanneer iemand de bot aanschrijft.
 * getUpdates geeft de laatste daarvan terug, zodat het scherm kan zeggen
 * "jij bent 123456789" in plaats van het familielid met een handleiding op
 * te zadelen.
 *
 * De lijst is kort van leven: Telegram bewaart updates 24 uur. Dat is
 * precies genoeg — je vult dit één keer in.
 */
async function telegramChats(): Promise<{ id: string; naam: string }[]> {
  const token = Deno.env.get('TG_BOT_TOKEN')
  if (!token) return []
  try {
    const antwoord = await fetch(`https://api.telegram.org/bot${token}/getUpdates`)
    if (!antwoord.ok) return []
    const data = await antwoord.json()
    const gezien = new Map<string, string>()
    for (const u of (data?.result ?? []) as Record<string, any>[]) {
      const chat = u?.message?.chat ?? u?.edited_message?.chat
      if (!chat?.id) continue
      const naam = [chat.first_name, chat.last_name].filter(Boolean).join(' ') ||
        chat.title || chat.username || 'Onbekend'
      gezien.set(String(chat.id), naam)
    }
    return [...gezien].map(([id, naam]) => ({ id, naam }))
  } catch {
    return []
  }
}

/**
 * De pushmeldingen naar de browsers.
 *
 * Ontbreken de VAPID-sleutels, dan slaat alleen dit over. Eerst stopte de
 * hele functie hier met een 500, en dan kwamen de mail en de WhatsApp ook
 * niet weg — terwijl die juist bestaan voor wie geen push heeft.
 */
async function pushen(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const publiek = Deno.env.get('VAPID_PUBLIC_KEY')
  const prive = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publiek || !prive) return { push_uit: true }

  try {
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:thuis@example.be',
      publiek,
      prive,
    )
  } catch (e) {
    // Een verkeerd VAPID_SUBJECT (geen mailto: of https:) of een sleutel met
    // een spatie erin gooit hier. Dat mag alleen de push kosten, niet de rest.
    return { push_fout: e instanceof Error ? e.message : 'VAPID klopt niet' }
  }

  const { data, error } = await supabase.rpc('pending_pushes', { limiet: 200 })
  if (error) return { push_fout: error.message }

  const rijen = (data ?? []) as Rij[]
  if (rijen.length === 0) return { verstuurd: 0, meldingen: 0 }

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
      // 404 en 410 tellen als bezorgd: dit toestel bestaat niet meer, dus
      // wachten heeft geen zin. Alle andere fouten laten de melding open,
      // zodat ze de volgende ronde meegaat.
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

  return { verstuurd, meldingen: klaar.length, opgeruimd: wegGooien.size }
}

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
  // De laatste fout per weg, om terug te geven. Zonder dit weigert Meta een
  // sjabloon en zie je alleen dat er niets aankomt — en dan is opzetten
  // giswerk. De reden staat in hun antwoord; die hoort niet weggegooid te
  // worden.
  const fouten: Record<string, string> = {}

  for (const r of rijen) {
    const weg = WEGEN[r.kind]
    if (!weg) continue
    if (!weg.aan()) {
      if (!uit.includes(r.kind)) uit.push(r.kind)
      continue
    }
    try {
      const fout = await weg.stuur(r)
      if (fout === null) {
        gelukt.push(r)
        geteld[r.kind] = (geteld[r.kind] ?? 0) + 1
      } else {
        fouten[r.kind] = fout
      }
    } catch (e) {
      // Blijft openstaan voor de volgende ronde.
      fouten[r.kind] = e instanceof Error ? e.message : 'onbekende fout'
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
    ...(Object.keys(fouten).length > 0 ? { wegen_fouten: fouten } : {}),
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
  {
    aan: () => boolean
    /** null als het gelukt is, anders de reden — die is bij opzetten alles waard. */
    stuur: (r: AlertRij) => Promise<string | null>
  }
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
      return await reden(antwoord)
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
      // Meta wil E.164 zónder plusteken: 32475123456, niet +32475123456. In
      // de database staat hij mét, want zo lezen mensen een nummer. Hier gaat
      // hij eraf, en alleen hier.
      const antwoord = await fetch(
        // Meta laat een versie ongeveer twee jaar staan en zet ze dan uit.
        // Instelbaar, zodat dat later een secret is en geen deploy.
        `https://graph.facebook.com/${Deno.env.get('WA_VERSIE') ?? 'v23.0'}/${Deno.env.get('WA_PHONE_ID')}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${Deno.env.get('WA_TOKEN')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: r.address.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: Deno.env.get('WA_TEMPLATE'),
              language: { code: Deno.env.get('WA_TEMPLATE_TAAL') ?? 'nl' },
              // Een sjabloon zonder variabele mag geen components meegeven;
              // Meta weigert het dan wegens "number of parameters does not
              // match". Zet WA_MET_TEKST op 'nee' om eerst met Meta's eigen
              // hello_world te bewijzen dat token, nummer en ontvanger
              // kloppen — dan hoef je niet op sjabloongoedkeuring te wachten
              // om te weten of de rest werkt.
              ...(Deno.env.get('WA_MET_TEKST') === 'nee'
                ? {}
                : {
                    components: [
                      { type: 'body', parameters: [{ type: 'text', text: tekst }] },
                    ],
                  }),
            },
          }),
        },
      )
      return await reden(antwoord)
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
      return await reden(antwoord)
    },
  },
}


/**
 * Waarom weigerde de andere kant?
 *
 * Meta en Resend zetten de reden in hun antwoord, en die is bij het opzetten
 * het enige verschil tussen "het werkt niet" en "het sjabloon heet anders".
 * Kort houden: dit komt in een scherm terecht, niet in een logboek.
 */
async function reden(antwoord: Response): Promise<string | null> {
  if (antwoord.ok) return null
  try {
    const tekst = await antwoord.text()
    try {
      const j = JSON.parse(tekst)
      const m = j?.error?.message ?? j?.description ?? j?.message
      if (typeof m === 'string' && m) return `${antwoord.status}: ${m}`.slice(0, 300)
    } catch {
      // Geen JSON; dan de tekst zelf.
    }
    return `${antwoord.status}: ${tekst}`.slice(0, 300)
  } catch {
    return String(antwoord.status)
  }
}

/** Geen HTML uit een tekstveld laten ontsnappen, ook al schrijft de app ze zelf. */
function ontsnap(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
