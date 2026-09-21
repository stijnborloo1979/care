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
7. `07_display_prefs.sql` — tekstgrootte, contrast en eenvoudige modus,
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
  Daaronder: `planning`, `wie`, `huis`, `fotos`, `berichten`, `logboek`,
  `documenten`, `weetjes`, `instellingen`.

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

## Wat de persoon zelf kan

- **Onthoud dit** — inspreken of typen wat je wil onthouden. Later vraag
  je "waar heb ik mijn sleutels gelegd?" en krijg je het antwoord met het
  tijdstip waarop je het zei.
- **Heb ik dit al gedaan?** — medicatie, maaltijden en wandelingen, uit wat
  er echt afgevinkt of bevestigd is. Staat de medicatie nog open, dan kan
  je ze vanuit het antwoord meteen bevestigen.
- **Herinneringen worden uitgesproken** — tien minuten voor een afspraak,
  of meteen als de app pas na het begin opengaat. 's Nachts niet. Browsers
  vragen daarvoor één aanraking van het scherm na elke herstart.

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
