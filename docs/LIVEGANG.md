# Livegang — checklist

Wat er moet gebeuren om LifeAngle live te zetten, in deze volgorde. Alles
hier gebeurt in een dashboard (Supabase, Cloudflare, Resend) of op een toestel;
de code zelf is klaar en getest (zie onderaan).

Vink af in de pull request of in een kopie van dit bestand.

## 1. Database (Supabase → SQL Editor)

- [ ] Maak een back-up van het project (Database → Backups) voor je begint.
- [ ] Zet de extensies aan: Database → Extensions → **pg_cron**, **pg_net**,
      en **vector** als je de spraakassistent met eigen gegevens (`09_ai.sql`)
      gebruikt.
- [ ] Draai alle migraties in `supabase/` die nog niet gedraaid zijn, in
      volgorde van nummer. Sla `10_rls_tests.sql` over (dat is een test).
      Er is geen 28. Van 46 zijn er twee: eerst `46_my_households_herstel.sql`,
      dan `46_voice.sql`. De laatste is `87_uitnodiging_familie_herstel.sql`:
      **draai die zeker**, anders kan een familiebeheerder niemand uitnodigen.
- [ ] Krijgt de app overal 403, of geeft "Klaar" bij de onboarding 409? Dan
      staan de API-rechten niet open (nieuwere projecten doen dat niet meer
      vanzelf). Draai `supabase/handmatig/rechten_herstellen.sql`; de
      controle onderaan moet `true, true, 0, 1` tonen.
- [ ] Draai `76_systeemcontrole.sql` als laatste opnieuw. Daarna toont de app
      zelf welke updates nog ontbreken: Instellingen (familiebeheerder) en
      Beheer (WZC-beheerder) → **Systeemcontrole**. Daar mag niets meer
      ontbreken.
- [ ] Alleen voor een proefomgeving: `02_demo_data.sql` (vul bovenaan je eigen
      e-mailadres in). Niet op productie.

## 2. Geplande taken

- [ ] Draai `supabase/handmatig/cron_inplannen.sql` in de SQL Editor. Vul
      bovenaan het projectadres en de service role key in. Zet `v_embed` op
      `true` als je `embed` gebruikt. Bewaar het bestand daarna niet met de
      sleutel erin.
- [ ] De controlequery onderaan toont 10 taken (11 met `embed`).
- [ ] De dag erna: dezelfde query opnieuw. Overal `succeeded`.

## 3. Edge functions (Supabase → Edge Functions)

Deploy via Dashboard → Deploy a new function → plak `index.ts`. Deploy
`_test` en `verhuis-opnames` niet (zie onder).

| Functie | Verify JWT | Secrets |
|---|---|---|
| `send-invite` | aan | `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` |
| `pair-device` | **uit** | — |
| `turn-credentials` | **uit** | `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` |
| `push-notify` | aan | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `cleanup-storage` | aan | — |
| `delete-account` | aan | — |
| `voice-intent` | aan | `ANTHROPIC_API_KEY` of `OPENAI_API_KEY` (optioneel `AI_PROVIDER`, `AI_MODEL`) |
| `voice-transcribe` | aan | `OPENAI_API_KEY` (optioneel) |
| `embed` | aan | `OPENAI_API_KEY` (alleen met `09_ai.sql`) |
| `ask` | aan | `OPENAI_API_KEY` (alleen met `09_ai.sql`) |

- [ ] VAPID-sleutels: `npx web-push generate-vapid-keys` (op een pc met
      Node, of laat ze aanmaken). De publieke sleutel gaat ook naar
      Cloudflare als `VITE_VAPID_PUBLIC_KEY`.
- [ ] `verhuis-opnames` is alleen nodig als er nog oude opnames van verhalen
      in de bucket `messages` staan van voor migratie 56. Nieuw project of
      geen oude opnames: niet deployen.

## 4. Inloggen en mail (Supabase → Authentication)

- [ ] Providers → Email: aan, met magic link.
- [ ] Emails → Magic Link: vervang het sjabloon door dat uit de README
      (sectie *Inloggen*). Zonder `{{ .Token }}` werkt de code van zes
      cijfers niet.
- [ ] URL Configuration: Site URL = het adres van de site; bij Redirect URLs
      hetzelfde adres met `/**`.
- [ ] Eigen domein voor mail (Resend): domein toevoegen, DNS-records
      instellen, en dan `RESEND_API_KEY` en `MAIL_FROM` bij `send-invite`.
      Zonder dit verschijnt de uitnodigingslink op het scherm en stuur je
      hem zelf door. Dat werkt, maar is niet wat je bij de livegang wil.
- [ ] **Eigen SMTP is nodig, ook voor de pilot.** De inlogcodes verstuurt
      Supabase zelf. Zonder eigen SMTP levert Supabase alleen af aan adressen
      uit het team van het project, en hoogstens 2 mails per uur. Een gezin
      krijgt dan geen code en kan niet inloggen. Instellen: Authentication →
      SMTP Settings (kan met dezelfde Resend-account en hetzelfde domein).

## 5. Hosting (Cloudflare Pages)

- [ ] Variabelen bij Production: `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, en optioneel
      `VITE_CONTACT_EMAIL` en de `VITE_TURN_*`/`VITE_STUN_URL`. Zie
      `.env.example`.
- [ ] Na een gewijzigde variabele: Deployments → Retry deployment.
- [ ] Eigen domein: Custom domains → toevoegen. Daarna het nieuwe adres ook
      in Supabase (stap 4) en als `APP_URL` bij `send-invite`.
- [ ] Merge de branch naar `main`: Cloudflare bouwt dan automatisch.

## 6. Op echte toestellen testen

- [ ] Tablet van de persoon: koppelen met de code uit Instellingen, kiosk-
      modus aan, toestel herstarten → blijft ingelogd.
- [ ] iPhone: pushmeldingen werken alleen als de app op het beginscherm staat.
- [ ] Android-telefoon: pushmelding komt binnen.
- [ ] Videobellen over 4G/5G (wifi uit). Lukt het alleen op wifi, dan
      ontbreekt TURN.
- [ ] De 112-knop op een tablet zonder simkaart: toont wat te doen.
- [ ] Testmelding versturen (Instellingen → meldingen) per kanaal dat je
      gebruikt.
- [ ] Uitnodiging: nieuw familielid uitnodigen, mail komt aan, inloggen lukt.
- [ ] Taal: wissel naar Frans en Engels; tablet volgt de taal van het
      huishouden.

## 7. Woonzorgcentrum (Care)

- [ ] Woonzorgcentrum registreren via `/zorg/nieuw`.
- [ ] Of eerst rondkijken met de demo (knop op hetzelfde scherm), en die
      daarna wissen.
- [ ] Een medewerker uitnodigen, laten aanvaarden.
- [ ] Een gezin koppelen met de koppelcode (Delen → Woonzorgcentrum).
- [ ] Toewijzen, kamer geven, verblijf beëindigen.

Handleidingen met screenshots: `docs/handleiding-home/index.html` (gezinnen)
en `docs/handleiding/index.html` (woonzorgcentra).

## 8. Pilot

- [ ] Twee of drie gezinnen, één woonzorgcentrum.
- [ ] Eerste week: elke dag de controlequery uit stap 2 en Edge Functions →
      Logs bekijken.

## Nog open: beslissingen

- **Betalen.** De prijzen staan op `/prijzen` (Home € 14,95/maand of € 149/jaar,
  14 dagen gratis; Care op aanvraag), maar er wordt niets aangerekend. Voor
  echte betaling is een betaalprovider nodig (bijvoorbeeld Stripe of Mollie)
  en een koppeling in de code. Voor een gratis pilot hoeft dat niet.
- **Domein.** Nodig voor mail (stap 4) en dus voor het inloggen van gezinnen.
  Dit blokkeert de pilot.

## Wat in de code getest is

Op de branch `afwerking-livegang`:

- `tsc --noEmit`, unit-tests (`vitest --dir src`), functietests en
  `npm run build`: geslaagd.
- Alle migraties op een lege PostgreSQL 16 met pgvector en pg_cron, en alle
  SQL-tests in `supabase/tests/` (`run_local.sh`): geslaagd.
- `supabase/handmatig/cron_inplannen.sql`: weigert zonder invulling en
  zonder pg_cron/pg_net, plant 10 taken in, mag opnieuw gedraaid worden, en
  elk ingepland commando draait.

Niet getest vanuit de code: alles wat een echt Supabase-project, Cloudflare,
Resend of een echt toestel nodig heeft (stappen 1 tot en met 8 hierboven).
