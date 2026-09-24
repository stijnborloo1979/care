# Thuis

Een digitaal geheugen voor de persoon, zijn woning en zijn familie.

- Het scherm van de persoon: wat moet ik nu doen, wie komt er, waar ligt iets.
- Het familiescherm: planning, routines, medicatie, zorglogboek, documenten.

React + TypeScript + Tailwind, met Supabase als backend.

## Online zetten via Netlify

1. Zet deze map in een GitHub-repo (Add file → Upload files, de hele map ineens).
2. Netlify → Add new site → Import an existing project → GitHub → kies de repo.
3. Build command en publish directory laat je leeg: `netlify.toml` vult ze in.
4. Site configuration → Environment variables → voeg toe:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. Bij elke push naar `main` bouwt Netlify opnieuw.

Beide waarden staan in Supabase onder Project Settings → API. De anon key
mag publiek zijn: RLS beschermt de data, niet die sleutel. De `service_role`
key hoort nooit in deze repo en nooit in een `VITE_`-variabele.

## Online zetten via Cloudflare Pages

Werkt ook, naast of in plaats van Netlify. Cloudflare leest `netlify.toml`
niet; daarvoor staan `public/_headers` en `public/_redirects` klaar.

- Build command: `npm run build`
- Build output directory: `dist`
- Environment variables (Settings → Variables and Secrets, bij Production):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, en `NODE_VERSION` = `22`
- Zet het `pages.dev`-adres in Supabase bij Authentication → URL
  Configuration, als Site URL en met `/**` bij Redirect URLs.

## Database

De SQL staat in `supabase/`. Draai ze in de SQL-editor van je project:

1. `01_schema.sql` — tabellen, RLS-policies, RPC's, storage buckets.
2. `02_demo_data.sql` — het huishouden van Maria Janssens. Vul bovenaan
   eerst je eigen e-mailadres in; dat account wordt familiebeheerder.
3. `03_organisations.sql` — organisatielaag. Alleen nodig als je ook via
   zorgorganisaties wil werken.
4. `04_messages.sql` — berichten en spraakberichten.
5. `05_auth_invites.sql` — uitnodigingen. Zet daarna in Supabase onder
   Authentication → Providers e-mail aan met magic link, en voeg je
   Netlify-adres én `http://localhost:5173` toe bij Redirect URLs.
6. `06_nightly_job.sql` — zet routines om in de agenda van morgen, vult de
   medicatiemomenten aan en maakt meldingen. Zet pg_cron aan via
   Database → Extensions; de migratie plant zichzelf dan in op 02:30.
7. `07_display_prefs.sql` — tekstgrootte, contrast, accentkleur en eenvoudige modus,
   opgeslagen op het huishouden zodat familie ze van op afstand instelt.
8. `08_location.sql` — locatie en veilige zones. Staat uit tot iemand
   toestemt; posities worden na zeven dagen gewist.
9. `09_ai.sql` — optioneel. Zet eerst pgvector aan via Database →
   Extensions. De app werkt volledig zonder dit bestand.
10. `10_rls_tests.sql` — geen migratie maar een testscript; draait alles
    terug met ROLLBACK.
11. `11_calls.sql` — videobellen. Het gesprek loopt rechtstreeks tussen de
    toestellen; de tabel houdt alleen bij dát er gebeld wordt. Voor elk
    netwerk werkt het pas met een eigen TURN-server (coturn); zie de
    uitleg onderaan dat bestand.
12. `12_pairing.sql` — de tablet van de persoon koppelen met een code van
    acht cijfers. Hoort bij de edge function `pair-device`.
13. `13_quick_notes.sql` — "Onthoud dit": notities die de persoon zelf
    maakt, en die de assistent later kan terugvinden.
14. `14_ownership.sql` — de persoon als eigenaar. Drie fasen: zelf, samen,
    ondersteund. Meer ondersteuning vraagt de toestemming van de persoon.
    Bestaande huishoudens blijven op 'ondersteund'.
15. `15_calendar.sql` — zorgverleners mogen zelf afspraken plannen en hun
    eigen afspraken wijzigen. Wat familie plande, blijft van familie.
16. `16_life_stories.sql` — "Vertel eens": levensverhalen, bij voorkeur in
    de eigen stem. Per verhaal kan de persoon kiezen of familie meeluistert.
17. `17_radio.sql` — de radiozenders van het huishouden, hoogstens vier.
18. `18_medication.sql` — meerdere tijdstippen per medicijn, en het schema
    van vandaag en morgen meteen bijwerken na een wijziging.
19. `19_messages_heard.sql` — een beluisterd bericht blijft de rest van de
    dag op Vandaag staan en is de volgende ochtend weg. Niet beluisterde
    berichten blijven twee dagen, vastgezette altijd.
20. `20_push.sql` — pushmeldingen: de toestellen van familie, en wie wat
    krijgt. Het versturen doet de edge function `push-notify`. Onderaan
    het bestand staan de twee cron-regels, met pg_net.
21. `21_tasks.sql` — taken voor de familie: opnemen, toewijzen, afvinken
    en terugkerende taken. Niet zichtbaar voor de persoon of voor
    zorgverleners. Plan `task_reminders()` in om 07:00 via pg_cron.
22. `22_support_by_family.sql` — de familiebeheerder past het niveau van
    ondersteuning meteen toe, zonder het toestel van de persoon. Elke
    wijziging komt in het zorglogboek.
23. `23_room_photo.sql` — een foto per kamer. Familie kan nu overal een
    foto toevoegen: dingen, stappen, kamers, mensen, medicatie,
    herinneringen en berichten.

## Inloggen

`/login` toont drie deuren: wie zorgt, wie uitgenodigd werd, en de tablet
van de persoon. Familie logt in met een code van zes cijfers uit de mail,
of met een wachtwoord. De tablet wordt één keer gekoppeld met een code uit
Instellingen en blijft daarna ingelogd.

Zodat de mail een code bevat, pas je in Supabase het sjabloon aan:
Authentication → Emails → Magic Link. Vervang de inhoud door:

```html
<h2>Je code voor Thuis</h2>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Of klik op deze link: <a href="{{ .ConfirmationURL }}">inloggen</a></p>
<p>De code is een uur geldig.</p>
```

Zonder `{{ .Token }}` in het sjabloon krijg je alleen een link en werkt
het invullen van de code niet.

## Edge functions

In `supabase/functions/`. Aanmaken kan zonder CLI: Dashboard → Edge
Functions → Deploy a new function → plak het bestand.

- `send-invite` — stuurt de uitnodigingsmail. Secrets: `RESEND_API_KEY`,
  `MAIL_FROM`, `APP_URL`.
- `embed` — berekent embeddings voor weetjes en dingen. Plan elke nacht
  in, na `run_nightly()`. Secret: `OPENAI_API_KEY`.
- `pair-device` — koppelt de tablet van de persoon. Zet **Verify JWT
  uit** voor deze functie: de tablet is op dat moment nog niet ingelogd.
  De beveiliging zit in de code zelf: acht cijfers, tien minuten geldig,
  eenmalig, en hoogstens tien mislukte pogingen per kwartier per adres.
- `delete-account` — verwijdert een account (recht op vergetelheid).
  Verify JWT aan laten.
- `turn-credentials` — tijdelijke TURN-gegevens voor videobellen op 4G/5G.
  Secrets: `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`. Zet **Verify JWT uit**:
  met die schakelaar aan weigert Supabase de preflight van de browser en
  krijg je een CORS-fout. De functie controleert het token zelf.
- `push-notify` — stuurt de meldingen van de nachtjob door naar de
  toestellen van familie. Plan elke vijf minuten in. Secrets:
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Sleutels maak
  je met `npx web-push generate-vapid-keys`; de publieke gaat ook als
  `VITE_VAPID_PUBLIC_KEY` naar de app. Verify JWT aan laten.
- `cleanup-storage` — wist spraakberichten en foto's die nergens meer bij
  horen. Plan elke nacht in, na `run_nightly()`. Verify JWT aan laten.
- `ask` — beantwoordt een vraag uit de eigen gegevens. Secret:
  `OPENAI_API_KEY`. Vindt de zoektocht niets boven de drempel, dan wordt
  het model niet eens aangeroepen.

## Tests

```
npm test
```

Vitest draait de tests op de twee pure functies waar de app op staat of
valt: `whatNow()` (wat moet er nu gebeuren) en `beantwoord()` (de
spraakassistent). Beide rekenen met een vaste klok, dus ze zijn niet van
het tijdstip van draaien afhankelijk. `time.test.ts` dekt de tijdzone en
de zomertijd.

Voor de database is er `supabase/10_rls_tests.sql`. Dat maakt tijdelijke
gebruikers aan, controleert per rol wie wat mag zien, en draait alles
terug met ROLLBACK. Draai het na elke wijziging aan een policy: het is het
enige wat bewijst dat de zorgverlener de documenten echt niet ziet.

## Lokaal werken

```
npm install
cp .env.example .env     # en de twee waarden invullen
npm run dev
```

## Routes

- `/` — stuurt door op basis van je rol: de persoon blijft hier, familie
  gaat naar `/familie`.
- `/login` — magic link, geen wachtwoord.
- `/start` — onboarding in zes stappen, voor wie nog geen huishouden heeft.
- `/installeren` — uitleg per toestel om de app op het beginscherm te
  zetten, plus hoe je de tablet van de persoon klaarzet.
- `/uitnodiging?token=…` — de link die een familiebeheerder doorstuurt.
- `/persoon` — het scherm van de persoon, ook bereikbaar voor familie.
- `/memory`, `/memory/:roomId`, `/memory/ding/:itemId` — Home Memory.
- `/wie`, `/wie/:personId` — Wie is wie.
- `/nu` — "Wat moet ik nu doen?" als eigen scherm.
- `/praten` — spraakassistent, antwoordt alleen uit eigen gegevens.
- `/help` — bellen en noodnummer.
- `/fotos` — fototijdlijn met rustige modus.
- `/weetjes` — Memory Bank, met voorlezen.

Alle schermen van de persoon hangen onder `PersonLayout`, met de bottom
navigation die op elk scherm dezelfde vier bestemmingen toont.
- `/familie/instellingen` — leesbaarheid en privacy.
- `/familie` — dashboard, met sidebar op desktop en tabs op mobiel.
  Daaronder: `planning`, `wie`, `huis`, `fotos`, `berichten`, `taken`,
  `logboek`, `documenten`, `weetjes`, `instellingen`.

## Wat er al werkt

Inloggen, uitnodigen en aanvaarden, het Vandaag-scherm met "Wat nu?",
afvinken met optimistic update, spraakberichten in beide richtingen,
Home Memory (kamers, dingen, stappen, foto's), Wie is wie met bellen,
videobellen,
het hulpscherm, foto's en herinneringen met slideshow, de bottom navigation, en het familiedashboard met
statuskaart en medicatiebevestiging. Aan de familiekant ook planning en
routines, zorglogboek en documenten, elk op een eigen route.

De familie-interface wordt lazy geladen: de tablet van de persoon
downloadt hem niet.

## Meegroeiende ondersteuning

| Fase | Familie ziet | Meldingen |
|---|---|---|
| Zelf | De agenda, om mee te plannen | Geen |
| Samen | Agenda, medicatie, logboek | Geen |
| Ondersteund | Alles wat nodig is | Bij afwijkingen |

Wie de app zelf aanmaakt, is eigenaar en start in "zelf". De persoon kan
het niveau altijd zelf wijzigen; de familiebeheerder ook, meteen (zie
`22_support_by_family.sql`). Elke wijziging komt in het zorglogboek, met
wie ze deed. Wat familie in elke fase ziet, wordt afgedwongen in de
database (`mag_meekijken()`), niet alleen in het scherm.

## Wat de persoon zelf kan

- **Onthoud dit** — inspreken of typen wat je wil onthouden. Later vraag
  je "waar heb ik mijn sleutels gelegd?" en krijg je het antwoord met het
  tijdstip waarop je het zei.
- **Heb ik dit al gedaan?** — medicatie, maaltijden en wandelingen, uit wat
  er echt afgevinkt of bevestigd is. Staat de medicatie nog open, dan kan
  je ze vanuit het antwoord meteen bevestigen.
- **Vertel eens** — elke dag één vraag over het eigen leven, beantwoord
  door in te spreken of te typen. Geen teller of reeks; "niet vandaag"
  verbergt de vraag tot morgen.
- **Vandaag, vroeger** — elke dag één foto uit de tijdlijn, met voorrang
  voor een echte verjaardag, en een knop om erover te vertellen.
- **Radio** — één tik op het Vandaag-scherm speelt de favoriete zender.
  "Zet de radio aan" werkt ook met de stem. De radio pauzeert tijdens een
  videogesprek en wordt zachter bij een gesproken herinnering. Een routine
  met "radio" in de naam start de zender vanzelf.
- **Herinneringen worden uitgesproken** — tien minuten voor een afspraak,
  of meteen als de app pas na het begin opengaat. 's Nachts niet. Browsers
  vragen daarvoor één aanraking van het scherm na elke herstart.

## Kioskmodus

Voor de vaste tablet, aan te zetten bij Instellingen → De vaste tablet.
Geldt alleen op de gekoppelde tablet (rol `person`), nooit op het toestel
van familie. Staat in `display_prefs`, dus geen migratie nodig.

- Scherm blijft aan (Wake Lock).
- Na 2, 5 of 10 minuten zonder aanraking terug naar Vandaag, bovenaan.
  Een gesprek, opname of spraakvraag wordt nooit onderbroken
  (`useKioskBezig()`), en `/fotos` blijft staan voor de diavoorstelling.
- 's Nachts een gedimde klok met dag en dagdeel. Eén tik toont een minuut
  het gewone scherm.
- Met Fully Kiosk Browser (JavaScript Interface aan) gaat ook de echte
  helderheid omlaag, en gaat het scherm aan bij een melding.

Vastzetten doet het toestel zelf: Begeleide toegang op iPad, app
vastzetten of Fully Kiosk op Android. De uitleg staat op `/installeren`.

## Talen

Nederlands, Frans en Engels. De taal staat bij de weergave-instellingen,
dus op het huishouden: familie stelt ze van op afstand in en de tablet
volgt. Ze bepaalt de teksten, de locale voor datums en uren, en de taal
van de stem — voorlezen én verstaan.

De woordenboeken staan in `src/lib/i18n.ts`, zonder bibliotheek: een
object per taal en één functie `t()`. Een ontbrekende vertaling valt terug
op het Nederlands.

Alle schermen van de persoon zijn vertaald: Vandaag, Wat nu, Wie is wie,
Hulp, In huis, Foto's, Weetjes, Radio, Praten, Onthoud dit, het
oproepscherm, het nachtscherm en de bottom navigation. De familiekant
staat nog in het Nederlands en verhuist scherm per scherm naar `t()`.

Nog taalgebonden en dus nog niet vertaald: de spraakassistent
(`answerEngine.ts` zoekt op Nederlandse woorden), `quickAdd()` (leest
Nederlandse datums), en de vragen van "Vertel eens".

## Offline

De query-cache wordt een dag lang in localStorage bewaard, zodat de tablet
bij een hikkende wifi de laatst geladen dag toont in plaats van een leeg
scherm. Afvinken en medicatie bevestigen worden gepauzeerd en verstuurd
zodra de verbinding er weer is — ook na het sluiten van de app, want die
mutaties staan op de queryClient en niet in een component.

Bovenaan verschijnt dan één regel die zegt wat er wacht.

De rest van de schermen komt uit het HTML-prototype; dat blijft de
referentie voor de UI.

`quickAdd()` zet gewone taal om in een afspraak: "donderdag 14u dokter"
wordt een agenda-item. Begrijpt ze de tijd niet, dan geeft ze null terug
in plaats van te gokken — een afspraak op het verkeerde uur is erger dan
een afspraak die je zelf moet invullen.

`src/features/today/whatNow.ts` is bewust een pure functie zonder React of
Supabase: die logica bepaalt wat de persoon te zien krijgt en moet met een
vaste klok te testen zijn.

## Versies

De afhankelijkheden staan bewust op behoudende majors (React 18, Vite 5,
Tailwind 3). Opwaarderen naar Tailwind 4 vraagt een andere configuratie —
doe dat als een aparte stap, niet tijdens het opzetten.
