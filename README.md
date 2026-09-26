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
24. `24_fix_embedding_trigger.sql` — herstelt de trigger uit `09_ai.sql`.
    Die keek naar `new.title` bij elke update op `item`, waardoor een foto
    bij een ding niet bewaard kon worden. Alleen nodig als je 09 draaide.
25. `25_medication_history.sql` — leest terug wat er bevestigd werd, houdt
    het schema bij via een trigger en de voorraad per medicijn.
26. `26_analyse.sql` — de analyses achter `/familie/analyse` en het
    verslag: dagritme, weekpatroon, nachtelijke activiteit en dekking.
    Draai dit na 25.
27. `27_layout.sql` — de indeling van het dagscherm van de persoon, zodat
    familie zelf bepaalt welke blokken erop staan.

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
  Daaronder: `planning`, `wie`, `huis`, `fotos`, `berichten`, `analyse`,
  `indeling`, `taken`, `logboek`, `documenten`, `weetjes`, `instellingen`.
- `/levensboek`, `/verhaal/:id` — het levensboek en één verhaal na het
  scannen van een QR-code.
- `/verslag?dagen=90` — het verslag voor de dokter. Staat bewust buiten de
  familie-opmaak: op papier hoort er geen zijbalk bij.
- `/familie/indeling` — familie stelt het dagscherm van de persoon samen.

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

De spraakassistent werkt in de drie talen. De woorden waaraan ze een vraag
herkent staan per taal in `src/features/voice/patronen.ts`, los van de
logica: wat er vandaag gepland staat is in elke taal hetzelfde. Wat de
regels niet herkennen, gaat naar de edge function `ask`, die in de eigen
gegevens zoekt en antwoordt in de taal van het huishouden — ook als de
gegevens in een andere taal staan.

Nog taalgebonden en dus nog niet vertaald: `quickAdd()` (leest Nederlandse
datums), de vragen van "Vertel eens", en de hele familiekant.

## Het levensboek

"Vertel eens" verzamelt elke dag één antwoord. Op `/levensboek` worden die
samen een boek: een titelblad, een inhoudsopgave en hoofdstukken die
grofweg met een leven meelopen (`src/features/stories/hoofdstukken.ts`
deelt de vragen in; `hoofdstukken.test.ts` bewaakt dat elke vraag ergens
terechtkomt en dat niet alles in het resthoofdstuk belandt).

Afdrukken en PDF laat de browser doen, via "Opslaan als PDF". Geen
PDF-bibliotheek in de bundel, geen installatie op een beheerde computer,
en familie ziet vooraf wat ze krijgt. De printregels staan in
`src/index.css`: elk hoofdstuk op een nieuw blad, een verhaal nooit
halverwege gesplitst.

Foto's uit de tijdlijn komen in het hoofdstuk waar hun titel over gaat;
wat niet te plaatsen is, staat achteraan onder "Uit het album". Naast elk
verhaal met een opname staat een QR-code, die in de browser getekend
wordt. Scannen opent `/verhaal/:id` in de app: een gewoon scherm achter
het inloggen, zodat een boek dat rondgaat geen privéopnames publiek maakt.
Een ondertekende link op papier zou trouwens binnen het uur verlopen.

"Luister alles" speelt alle opnames na elkaar, als een luisteralbum.

## Berichten weghalen

Een foto die familie stuurt, blijft twee dagen op het scherm van de persoon
staan en wordt na zeven dagen gewist. Dat stapelt dus niet op — maar wie
net een verkeerde foto stuurde, kon er niets aan doen. De Berichten-pagina
liet niet eens zien wát er stond, dus je kon het niet weghalen omdat je het
niet zag. Dat was het eigenlijke gat; de knop is maar de helft ervan.

**Familie** krijgt op `/familie/berichten` de lijst "Staat nu op haar
scherm", met per bericht van wie, wanneer, of zij het al bekeken heeft, en
een knop "Weghalen". Verwijderen mocht al volgens de policy op `message`
(wie het stuurde, of een beheerder); er was alleen nergens een knop.

Ingesproken berichten hebben "Opzij" pas nadat ze het bericht gehoord
hebben — ervoor zou het een manier zijn om iets weg te doen zonder het te
kennen. De knop staat onder de afspeelknop en niet erin: de weg naar
luisteren mag niet smaller worden om plaats te maken voor opruimen.

**De persoon** krijgt geen verwijderknop. Dat is onomkeerbaar, en "weg"
betekent voor haar iets anders dan voor familie. Haar knop "Gezien" haalt
de foto nu wél van het scherm — eerder bleef die staan, en beloofde de knop
iets dat niet gebeurde. Dat gaat via `hide_message()`, dat de vervaldatum op
nu zet: dezelfde weg die het bericht na twee dagen toch zou gaan. Voor
familie blijft het bestaan.

### seen betekent twee dingen

`person_inbox.seen` is `r.profile_id = auth.uid()`: heeft **de kijker** het
gezien. Op het scherm van de persoon klopt dat. Zodra familie in dezelfde
lijst meekijkt, gaat het "heeft Els het gezien" betekenen — en dan staat er
bij een foto dat Maria hem bekeken heeft terwijl Els dat deed.

Dat is geen schoonheidsfoutje: familie beslist daarop om niet te bellen.
`29_bericht_weg.sql` voegt daarom `seen_by_person` toe, dat via
`membership.role = 'person'` echt over haar gaat.

### De naam bij een bericht

Wie zich aanmeldt zonder naam op te geven, krijgt zijn e-mailadres als
`profile.full_name` — en dan staat er "Foto van borloo.stijn@telenet.be" op
het scherm van iemand met geheugenproblemen. `toonNaam()` maakt daar "Borloo
Stijn" van: wat vóór de @ staat, in woorden, met hoofdletters. Geen gok over
voor- en achternaam; beter een benadering van een naam dan een adres. Werkt
ook voor berichten die er al staan, want het gebeurt bij het tonen.

Dat blijft een gok, dus op `/familie/instellingen` staat nu **Jouw naam**.
Zet er wat zij zou zeggen — "Els" of "mama" — en niet je volledige naam.
Staat er nog een e-mailadres, dan blijft het veld leeg met de benadering als
voorbeeld, in plaats van het adres alvast in te vullen. Het geldt vanaf het
volgende bericht: wat al verstuurd is, draagt de naam die er toen bij hoorde.

## Foto's: het vlak geeft de maat, niet de foto

`StoragePhoto` legde de foto als roosteritem in een vlak met
`place-items-center`. Een roosteritem wordt daar niet uitgerekt, dus
`h-full` deed niets: de foto kreeg de breedte van het vlak en daarna zijn
eigen hoogte, en wat eronder uitstak werd weggeknipt.

Voor een liggende foto viel dat nauwelijks op. Een staande foto — en zo
fotografeert iedereen met een telefoon — verloor boven- en onderkant. Ze
leek ingezoomd terwijl ze gewoon afgesneden was, en `object-fit` kon er
niets aan doen omdat het vlak nooit de maat gaf.

De foto ligt nu absoluut in het vlak (`absolute inset-0`), zodat het kader
de maat bepaalt en `object-fit` weer betekenis heeft. Dat raakt elke foto
in de app: kamers, dingen, stappen, mensen, medicatie, herinneringen.

`passend` schakelt van bijsnijden naar heel tonen. De kamertegels gebruiken
het: daar moet je de kamer herkennen, en een randje langs de zijkant is het
kleinere kwaad. Elders blijft bijsnijden de standaard, want dat staat
strakker.

De kamertegels zelf zijn ook groter: de foto vult de hele breedte van de
tegel in plaats van een strook van 64 px, en het rooster gaat pas bij `lg`
naar drie kolommen. Drie kolommen in een kolom van 36rem maakt elke foto
zo'n 170 px breed, en dan is een kamer niet meer te herkennen — het enige
waar die tegel voor dient.

## Op een telefoon

### De tijdlijn en de onderbalk bij grote tekst

Twee dingen die pas stukgaan als de tekstgrootte omhoog gaat, en dat is
precies de stand waarin deze app gebruikt wordt.

**De afvinkknop werd buiten beeld geduwd.** Bij `scale 1.5` is "Ongedaan"
een knop van 158 px. Met `shrink-0` in een rij die niet mag afbreken, wordt
zo'n knop niet kleiner maar naar buiten geschoven — over de titel heen. De
rij breekt nu af (`flex-wrap`), en de knop zakt naar de volgende regel. Op
dat scherm is dat ook een betere plek: een knop die bijna de hele breedte
krijgt, mis je niet. Vanaf ongeveer 412 px past alles weer op één regel.

**De onderbalk verloor zijn laatste item.** Vijf labels moeten op 360 px
naast elkaar passen; bij extra grote tekst schoof "Help" eruit — net het
item dat er altijd moet zijn. De labels groeien nu tot 16 px en niet verder
(`.hoofdnav a`), en elk item mag krimpen (`min-w-0`). De iconen blijven
groot en de plaatsen veranderen nooit: dat zijn de dragers van die
navigatie, het woord eronder is de bevestiging.

Gemeten op 360, 390 en 412 px bij `scale` 1, 1.3 en 1.5: nergens
horizontale overloop, nergens iets buiten beeld.



Twee soorten fouten, en het is de moeite ze uit elkaar te houden.

**Een rij die niet wil wijken.** Overal in de familieschermen staat een
label naast een knop: `flex items-center justify-between`. `DictateButton`
heeft `shrink-0`, dus bij weinig ruimte krimpt het label en niet de knop —
en dan wordt "Waar ligt of staat het?" één woord per regel terwijl de knop
buiten beeld schuift. `flex-wrap` erbij lost het op: op een breed scherm
verandert er niets, op een smal wipt de knop naar de volgende regel. Acht
plaatsen, één woord per plaats.

**Een vorm die niet past.** Het weekpatroon stond in zeven kolommen. Op
360 px is elke kolom nog geen 45 px en loopt "85 %" tegen de rand van zijn
vakje. Daar helpt geen enkele aanpassing aan de maten: zeven kolommen passen
daar gewoon niet. Horizontaal scrollen is hier geen uitweg — dat is nergens
in deze app een uitweg — dus worden het regels, één per dag, met de balk
liggend. Dezelfde gegevens, een andere vorm. Vanaf `sm` komen de kolommen
terug, want dan is de vergelijking tussen dagen in één oogopslag te maken.

Gemeten op 360, 390, 412 en 820 px: nergens horizontale overloop, en geen
enkel element buiten beeld.

## De dag klaarzetten zonder op de nacht te wachten

De agenda van de persoon wordt 's nachts gemaakt uit haar routines, door
een job op pg_cron. Die moet je apart inschakelen. Doe je dat niet, dan
gebeurt er nooit iets — en het faalt volkomen stil: haar tijdlijn blijft
leeg, "Wat nu?" weet niets, en er is geen medicatiemoment om te
bevestigen. Niets wijst naar de oorzaak; het lijkt of de app niets doet.

Een app die alleen werkt als iemand een databasejob heeft ingesteld, is
stuk. `32_dag_klaarzetten.sql` zet daar een vangnet onder:

- **`dag_klaarzetten()`** materialiseert morgen altijd, en vandaag alleen
  als die nog helemaal leeg is. Dat onderscheid is nodig: `materialise_day`
  zegt in zijn eigen commentaar dat een verwijderd item bij een herhaling
  terugkomt. Dat mag niet gebeuren omdat iemand toevallig het dashboard
  opent. Staat de dag leeg, dan is er niets om terug te zetten.
- Het zet ook de **medicatiemomenten** klaar. De oude knop "Vandaag
  bijwerken" deed dat niet, dus bleef het schema leeg ook nadat je hem
  gedrukt had.
- `useDagKlaar()` roept het **één keer per dag** aan zodra familie de app
  opent, met de datum in localStorage als slot. Mislukt het, dan gebeurt het
  de volgende keer gewoon opnieuw.

De oude `materialiseToday()` nam bovendien de datum in UTC. Rond
middernacht in de zomer is dat bij ons nog gisteren.

De nachtjob blijft het beste: die draait ook als niemand de app opent. Dit
is wat eronder hangt.

### Een lege dag verdwijnt niet meer

Het blok "Vandaag" werd helemaal weggelaten als er geen items waren. Zo kon
een niet-draaiende job maandenlang onopgemerkt blijven: familie zag geen
fout, alleen niets. Nu staat er "Er staat vandaag niets gepland" — rustig
genoeg voor haar, en herkenbaar voor wie meekijkt.

Dat is dezelfde regel als elders in dit bestand: op het scherm van de
persoon is terugvallen op iets zichtbaars altijd beter dan stil verdwijnen.

## "Dit ben ik"

Wie naar het ziekenhuis of een woonzorgcentrum gaat, komt daar aan als een
naam op een lijst. Het personeel weet op dag één niet wie haar dochter is,
dat ze onrustig wordt rond vier uur, of dat muziek haar kalmeert. In het
Verenigd Koninkrijk bestaat daar een papieren formulier voor dat overal
gebruikt wordt, juist omdat die behoefte zo groot is.

De app weet dat bijna allemaal al. `/dit-ben-ik` zet het op één blad:
familie en contacten, waar ze vandaan komt (uit het levensboek), hoe haar
dag thuis verloopt (uit de routines), wat ze graag heeft (uit de weetjes
onder "voorkeuren"), en de medicatiemomenten.

In de ik-vorm, bewust. Dit gaat over een mens, niet over een dossier.

### Drie velden die nergens anders stonden

`31_dit_ben_ik.sql` voegt `household.profiel` toe voor wat de app niet kon
weten: hoe ze aangesproken wil worden, hoe je best met haar praat, wat
helpt als ze onrustig is, en waar ze van overstuur raakt. Vrije tekst —
wat iemand rustig maakt, laat zich niet aanvinken.

Familie vult ze in op `/familie/wie`, veld per veld, met opslaan bij het
verlaten van het vakje. In één keer doet niemand dit.

Een leeg veld verdwijnt niet van het blad maar zegt dat het leeg is. Leest
iemand "Als ik onrustig ben, helpt dit" en staat er niets, dan weet hij dat
het niemand gevraagd is — in plaats van te denken dat er niets helpt.

### Geen doseringen

Er staan tijdstippen op, geen doseringen. Een blad dat familie thuis
bijhoudt, hoort niet gebruikt te worden om medicatie toe te dienen;
daarvoor is het schema van de huisarts of apotheek er, en een verouderde
lijst in de handen van een verpleegkundige is gevaarlijker dan geen lijst.
Dat ze gewend is om acht uur iets te krijgen, is zorgcontext en geen
voorschrift — dat staat er dus wel, met die zin erbij.

## Waarom een melding niet aankomt

Push valt op drie plaatsen stil, en alle drie doen ze dat zonder een
spoor. Wie dat niet weet, concludeert dat de app niet werkt.

1. **Toestemming is per toestel én per account.** Meldingen aanzetten op de
   tablet doet niets voor de telefoon van de dochter. Er is één rij per
   toestel in `push_subscription`.
2. **Alleen in de fase "ondersteund".** `pending_pushes()` filtert daarop.
   Een bewuste keuze — in de fase "zelf" hoort familie niet ongevraagd
   berichten te krijgen over iemand — maar wie hem niet kent, zoekt zich
   blind.
3. **`push-notify` moet draaien.** Die edge function hangt aan pg_cron, en
   pg_cron moet je apart inschakelen. Zonder dat wordt er nooit iets
   verstuurd, hoeveel toestellen er ook klaarstaan.

`34_push_nakijken.sql` maakt die drie zichtbaar. Onder "Meldingen op dit
toestel" staat nu welke stap er nog in de weg zit, in de volgorde waarin je
ze moet oplossen, plus een knop om een testmelding te sturen — langs precies
dezelfde weg als een echte, want een test die een andere weg neemt bewijst
niets.

### Niet op de cron wachten

"Bel me eens" en "ik heb hulp nodig" roepen `push-notify` nu meteen zelf
aan. De edge function laat "Verify JWT" aan staan, dus een ingelogd
familielid mag haar aanroepen; ze stuurt alleen wat er al klaarstaat, dus
dat is een duwtje en geen achterdeur. Mislukt het, dan gebeurt er niets
ergs: de melding staat in de database en gaat mee met de volgende ronde —
áls die er is.

### En als de browser helemaal geen meldingen kan geven

Dan valt de hele push weg, en dan helpt geen enkele instelling. Dat is geen
randgeval:

- **iPhone en iPad** kennen web push alleen wanneer de app op het
  beginscherm staat. In Safari als tabblad bestaat `PushManager` niet.
- Een **beheerde werklaptop** kan meldingen per beleid blokkeren.
- Wie ze één keer weigerde, krijgt de vraag **niet opnieuw**.

Voor "medicatie nog niet bevestigd" is dat te verdragen. Voor de twee
berichten die de persoon zélf verstuurt niet: die mogen niet afhangen van
een browserinstelling.

`35_mail.sql` geeft daarom elke melding van niveau `warn` of `alert` een
tweede weg: **e-mail**. Geen toestemming nodig, werkt op elk toestel, komt
ook aan als niemand de app open heeft. Dezelfde secrets als `send-invite`
(`RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`); ontbreken ze, dan blijft alleen
de push over en zegt het antwoord van de functie `mail_uit`.

Twee bewuste verschillen met push:

| | push | e-mail |
| --- | --- | --- |
| niveaus | alles | alleen `warn` en `alert` |
| fase | alleen "ondersteund" | elke fase |

Het eerste houdt de mailbox leeg: wie mail krijgt bij elk afgevinkt ontbijt,
ziet de ene mail die telt niet meer. Het tweede omdat de persoon hier zélf
om contact vraagt — dat is geen toezicht, en dus hoort het niet bij de fase
"ondersteund".

Elk familielid beslist voor zichzelf, bij Meldingen. Standaard staat het
aan, want dit is het vangnet.

### Vier wegen, en waarom niet één

`36_kanalen.sql` maakt er één ding van: een familielid heeft nul of meer
kanalen, en elk kanaal krijgt dezelfde melding. Mail hoort daar ook bij,
zonder dat er een rij voor nodig is — het adres staat al in `auth.users`.

| weg | snelheid | nodig | werkt met de app dicht |
| --- | --- | --- | --- |
| realtime in de app | < 1 s | niets | nee |
| push in de browser | seconden | toestemming per toestel | ja, waar het kan |
| WhatsApp | seconden | Meta-setup, ±€0,014 per bericht | ja |
| Telegram | seconden | een bot, gratis | ja |
| e-mail | seconden tot minuten | niets | ja |

Realtime staat er niet voor niets bij: het is de snelste en de goedkoopste,
en het vraagt niemand iets. `useRealtime` luistert nu ook op `notification`,
dus het familiedashboard reageert meteen in plaats van bij het volgende
verversen. Alleen: het werkt niet met de app dicht, en daarvoor zijn de
andere er.

**WhatsApp** stuurt geen vrije tekst naar iemand die jou niet in de laatste
24 uur berichtte, dus altijd een goedgekeurd sjabloon met één variabele —
bijvoorbeeld `Thuis: {{1}}`, met de tekst van de melding erin. Secrets:
`WA_TOKEN`, `WA_PHONE_ID`, `WA_TEMPLATE` en eventueel `WA_TEMPLATE_TAAL`
(standaard `nl`). Het gratis testnummer van Meta mag naar vijf opgegeven
nummers sturen, wat voor één familie genoeg is en de bedrijfsverificatie
uitspaart.

#### WhatsApp opzetten, stap voor stap

Eenmalig werk van ongeveer een namiddag. Daarna nooit meer.

1. **Een app maken.** `developers.facebook.com` → My Apps → Create App. Kies
   de use case **"Connect with customers through WhatsApp"**. Je hebt een
   Meta-account nodig; een bedrijfspagina niet.
2. **Het testnummer nemen.** Onder WhatsApp → API Setup staat een gratis
   testnummer van Meta, met een **Phone number ID** eronder. Dat ID is
   `WA_PHONE_ID`. Het testnummer stuurt alleen naar nummers die je er zelf
   bij zet — een handvol, in de praktijk vijf — en dat is genoeg voor één
   gezin. Zo hoef je geen extra simkaart te zoeken en geen bedrijfsverificatie
   te doorlopen.
3. **Elk familielid toevoegen** bij "To", en elk van hen bevestigt de code die
   Meta stuurt. Zonder die bevestiging weigert Meta het bericht.
4. **Een blijvend token.** Het token op de API Setup-pagina vervalt na 24 uur.
   Ga naar Business Settings → Users → **System Users** → Add, geef die
   gebruiker toegang tot je WhatsApp-account en genereer een token met
   `whatsapp_business_messaging` en `whatsapp_business_management`. Dat is
   `WA_TOKEN`, en dat verloopt niet.
5. **Een sjabloon.** WhatsApp → Message Templates → Create. Categorie
   **Utility** (niet Marketing — een marketingtoon in een utility-sjabloon is
   de meest voorkomende reden voor afkeuring). Taal Nederlands. Eén variabele
   in de body:

   ```
   Thuis: {{1}}
   ```

   De naam die je kiest is `WA_TEMPLATE`. Goedkeuring duurt meestal minuten
   tot een dag.
6. **De secrets invullen** bij Edge Functions → Secrets: `WA_TOKEN`,
   `WA_PHONE_ID`, `WA_TEMPLATE`. Staat je sjabloon in een andere taal dan
   Nederlands, dan ook `WA_TEMPLATE_TAAL`.
7. **Het nummer invullen** in de app, bij Instellingen → Meldingen, en op
   "Stuur een testmelding" drukken.

Weigert Meta het bericht, dan staat de reden onder die knop — letterlijk wat
zij terugstuurden, bijvoorbeeld `400: Template name does not exist in the
translation`. Dat is bewust: zonder die regel is opzetten giswerk, want een
geweigerd bericht ziet er van buiten uit als een bericht dat niet aankomt.

De veelvoorkomende redenen: het sjabloon heet anders dan `WA_TEMPLATE`, de
taalcode klopt niet, het sjabloon is nog niet goedgekeurd, het nummer staat
niet bij de toegestane ontvangers, of het token is dat van 24 uur.

**Telegram** heeft alleen `TG_BOT_TOKEN` nodig. Een bot maak je bij
@BotFather in Telegram zelf; die geeft het token. Het familielid stuurt de
bot één keer `start` en drukt dan bij Meldingen op **"Zoek mijn chat-id"**.

Die knop bestaat omdat een bot niet uit zichzelf antwoordt: zonder hem heeft
een familielid geen enkele manier om zijn chat-id te weten te komen, en dan
is het veld onbruikbaar. `push-notify` roept `getUpdates` aan en geeft terug
wie de bot de laatste 24 uur aanschreef, met naam erbij, zodat er iets te
kiezen valt in plaats van iets over te typen.

Eén nuance: die lijst toont iedereen die de bot recent aanschreef, aan elk
familielid dat op de knop drukt. Bij één bot per gezin is dat geen bezwaar —
het zijn hun eigen namen — maar deel een bot dus niet over meerdere
huishoudens heen.

Ontbreekt een secret, dan slaat de functie die weg over en zegt het antwoord
welke uit staan (`wegen_uit`). Niets breekt; er valt alleen een weg weg.

Dat gold eerst níet voor de VAPID-sleutels: ontbraken die, dan stopte
`push-notify` meteen met een 500 en kwam er helemaal niets weg — ook de mail
en de WhatsApp niet, terwijl die juist bestaan voor wie geen push heeft. De
push zit nu in een eigen functie die alleen zichzelf uitschakelt
(`push_uit`). Dit is dezelfde fout als hierboven, een niveau hoger: één weg
die stilvalt, mag de andere niet meeslepen.

Het telefoonnummer wordt in de database genormaliseerd, niet in de app:
`0475 12 34 56`, `0032 475/12.34.56` en `+32 (475) 12-34-56` worden alle drie
`+32475123456`. Eén plaats om na te kijken in plaats van twee die uit elkaar
lopen. Alles zonder `+` en zonder landnummer wordt geweigerd in plaats van
geraden — een bericht naar het verkeerde nummer is erger dan geen bericht.

Een kanaal is van het familielid, niet van het huishouden: `alert_channel`
heeft row level security op `profile_id = auth.uid()`, dus een broer kan het
nummer van zijn zus niet opvragen of wijzigen. Nagegaan met een tweede
databankrol, niet alleen door de policy te lezen.

### Eén melding, meerdere ontvangers

`mark_pushed` en `mark_mailed` vinken pas af wanneer élke ontvanger bereikt
is. Dat was in de pushkant niet zo: de melding werd afgevinkt zodra één
toestel lukte, en verdween dan stil voor wie ze net niet kreeg. Nu telt
`push-notify` per melding hoeveel adressen en toestellen erbij horen en
hoeveel er weg zijn; wat niet volledig bezorgd is, blijft openstaan voor de
volgende ronde. Een verdwenen toestel (404 of 410) telt als bezorgd, want
wachten heeft daar geen zin.

Voor een melding uit de nacht is vijf minuten wachten prima. Voor iemand
die vraagt of je belt, niet.

## Waarom de app niet goed schaalde op een smartphone

Dit is vier keer apart gemeld en drie keer apart hersteld, telkens op het
scherm waar het opviel. De oorzaak was één ding, en die zat overal:

**Alle marges staan in `rem`, en `rem` groeit mee met de tekst.** Op een
scherm van 320 pixels bij tekstgrootte A+++ is de buitenrand 30 pixels, de
kaart 36, het blok daarin 24 en de kaart daarin nog eens 24 — samen 228 van
de 320. Er bleef 92 pixels over voor een woord als "vergrendelscherm".

Daar kwam een tweede bij: **30 plaatsen met `min-w-[12rem]` en dergelijke**.
Een minimumbreedte in rem wordt bij A+++ anderhalf keer zo groot, dus een
veld dat 192 pixels moest zijn, eiste er 288 — breder dan het scherm. Dat is
wat de tijdlijn en het Home Memory-formulier uit hun kader duwde.

Hersteld op de oorzaak in plaats van per scherm:

- elke `min-w-[Xrem]` werd `min-w-[min(Xrem,100%)]`. Dat verlaagt nooit iets,
  het begrenst alleen op de breedte die er werkelijk is.
- één regel in `index.css` krimpt de horizontale randen onder 480 pixels bij
  de twee grootste tekstmaten. Verticaal blijft het ruim — naar onder is er
  plaats. Grote tekst is bedoeld om meer letters te kunnen lezen, niet om
  meer wit te kunnen zien.
- `overflow-wrap: break-word` op `body`, zodat een lang Nederlands woord
  afbreekt in plaats van buiten zijn kaart te hangen.

Nagemeten op 320, 360 en 414 pixels bij elke tekstgrootte: geen horizontale
schuifbalk meer, op geen enkel scherm.

Bij diezelfde meting bleek de schakelaar zelf stuk: het bolletje stond
buiten de pil, op elke tekstgrootte en overal in de app. Een `absolute` kind
zonder `left` valt terug op zijn statische plaats, en die lag al rechts in
de pil; de verschuiving kwam daar bovenop. Eén `left-0` erbij, in alle drie
de schakelaars.

## De 112-knop die niet kon bellen

Op het Help-scherm stond "Noodnummer 112" als `tel:`-link. Op een tablet
zonder simkaart doet die niets. Dat is de gevaarlijkste knop die je kan
maken: iemand drukt erop in een echte noodsituatie en wacht op hulp die
niet komt.

De app kan niet zien of er een simkaart in zit — de browser zegt dat niet.
Ze kan wel zien of dit een **telefoon** is, en dat is genoeg, want een
telefoon kan altijd bellen. Vandaar drie standen in plaats van twee, bij
Instellingen → Bellen en 112:

| stand | waar staan de belknoppen |
| --- | --- |
| `telefoon` (standaard) | alleen op een telefoon |
| `ja` | overal — voor een tablet mét simkaart |
| `nee` | nergens |

De middelste beslist per toestel, en dat is nodig: één instelling geldt voor
alle toestellen van de persoon, dus voor de tablet in de living én voor haar
telefoon. Een harde ja zou op die tablet een 112-knop tonen die niets doet.

`isTelefoon()` mag zich maar in één richting vergissen: liever een telefoon
die voor tablet doorgaat (dan staat er een instructie in plaats van een
knop) dan omgekeerd. Daarom alleen de zekere gevallen — `userAgentData.mobile`
waar het bestaat (een Android-tablet zegt daar `false`), anders iPhone, of
Android met `Mobile` erin. Een iPad zegt "Macintosh" en valt dus af, wat
precies de bedoeling is. Nagekeken tegen echte user agents van iPhone, iPad
(beide vormen), Android-telefoon, Android-tablet en Windows.

Staat het op nergens — of op alleen-op-een-telefoon, op een tablet — dan:

- wordt de 112-knop een blok met wat familie daar invulde — waar de
  telefoon ligt, bij wie ze kan aanbellen. Concreet, want "bel 112" zonder
  telefoon is geen instructie.
- wordt het nummer van de huisarts leesbare tekst in plaats van een link
  die niets doet. Overtypen op een gewone telefoon kan wel.
- staat er een knop die wél werkt: **"Laat mijn familie weten dat ik hulp
  nodig heb"** (`vraag_hulp()`, niveau alert, hoogstens één melding per
  twee minuten).

Die knop is bewust niet rood en staat bewust ónder het 112-blok. Rood en
bovenaan zou hem tot noodknop maken, en dat is hij niet. Wat hij doet, zegt
hij letterlijk: familie krijgt een bericht.

### Waarom de terugbelknop niet verscheen

`BelKnop` koos op `person_card.profile_id` — of de kaart van dat familielid
aan een app-account gekoppeld is. Die koppeling wordt in de praktijk bijna
nooit gelegd: het beheerscherm zet hem niet, en in de demo-gegevens heeft
alleen de beheerder er een. Dus viel bijna elk familielid terug op een
telefoonlink.

Nu kiest hij op `kind`. Familie is bereikbaar via de melding, gekoppeld of
niet; de huisarts en de buurman krijgen geen melding, dus voor hen blijft
een nummer het juiste antwoord.

## Bellen gaat één kant op

`IncomingCall` — het stuk dat laat rinkelen en opneemt — hangt alleen in de
schil van de persoon. Familie luistert nergens. Een gesprek dat vanaf de
tablet gestart wordt, maakt dus een oproep aan waar niemand op wacht, en
die valt meteen weg.

Op haar Help-scherm stond intussen "Bel Els" als `tel:`-link. Een tablet
zonder simkaart opent daarop zijn eigen belfunctie, die nergens heen kan.
Een knop die iets belooft aan iemand die al onzeker is, is erger dan geen
knop.

`BelKnop` kiest nu op één ding: gebruikt die ander de app?

- **Wel** (een familielid met een account): het wordt een vraag.
  `vraag_gesprek()` zet een melding klaar, familie krijgt die via push en
  belt. Op haar scherm verandert de knop in een geruststelling — "Els weet
  het. Ze belt je zo terug." — en niet in een vinkje. Dat is wat ze wil
  weten. Familieleden zonder telefoonnummer staan nu ook op dat scherm,
  want ze zijn bereikbaar zonder.
- **Niet** (de huisarts, de buurman): een gewone `tel:`-link blijft de beste
  gok. Op een tablet werkt die niet, maar daar is deze app ook niet de weg
  naar de huisarts. 112 blijft om dezelfde reden staan zoals het is.

**Hoogstens één melding per tien minuten.** Wie onzeker is drukt nog eens,
en nog eens; twaalf meldingen maken van ongerustheid een alarm, en dan
begint familie ze weg te klikken — precies de gewoonte die je nooit wil
kweken. Zij krijgt elke keer gewoon te horen dat het gelukt is: een "je hebt
net al gevraagd" helpt niemand.

Echt tweerichtingsverkeer (familie laten meeluisteren naar inkomende
oproepen) is bewust níét gebouwd. Het voelt zoals mensen bellen verwachten,
maar het faalt stil: belt zij en heeft niemand de app open, dan hoort ze
niets rinkelen en denkt ze dat niemand haar wil spreken.

## Medicatie op het scherm van de persoon

Er zat een naad in het product die niemand zag: familie voerde een schema
in, de dokter kreeg een verslag van wat bevestigd werd, de spraakassistent
kon erover antwoorden — maar op haar scherm stond medicatie nergens. Wie
niet praat tegen de tablet, kon zijn eigen medicatie niet bevestigen.

De module **Medicatie** (`/familie/indeling`) toont het eerstvolgende
moment dat nog moet: naam, dosis, tijd, de instructie, de foto van de doos,
en één knop "Genomen". Wat al genomen is, staat eronder als een rustige
regel zonder knop — dat is het antwoord op "heb ik ze al genomen?", niet
iets om nog eens te doen.

Eén moment tegelijk, niet de lijst. Vier momenten is een lijst om te lezen,
en dat is precies wat dit scherm niet vraagt.

De foto staat er groot bij en wordt niet bijgesneden: een doosje herkennen
aan kleur en vorm is makkelijker dan een naam lezen, zeker een naam als
"rivastigmine".

De bevestiging gaat via de mutatie die op de queryClient staat
(`['confirmMedication']`), niet via een eigen functie. Zo vertrekt een
bevestiging die offline gegeven werd alsnog, ook nadat de tablet opnieuw
opgestart is.

## Medicatie: de foto van de verpakking

`medication.photo_path` bestond al, maar de knop verscheen alleen bij een
medicijn dat je bewerkte. Bij het toevoegen was er niets — je moest dus
eerst bewaren en het daarna in de lijst terugzoeken. Dat doet niemand.

Nu staat het fotoblok er altijd. Bij een bestaand medicijn wordt de foto
meteen bewaard; bij een nieuw medicijn houdt het formulier het bestand vast
en uploadt het zodra het opslaan een id teruggeeft — eerder kan de foto
nergens bij horen.

De knop is de gedeelde `FotoKiezer`, die bewust geen `capture` zet. Het oude
veld stond op `capture="environment"` en ging daarmee rechtstreeks naar de
camera; op sommige telefoons kan je dan niet meer uit je fotoalbum kiezen.
Zonder `capture` biedt het toestel zelf beide aan.

Een foto kan ook weg: een doosje in een keukenkast is snel scheef of
onscherp gefotografeerd. Eerst het pad wissen, dan het bestand — andersom
zou het scherm naar een foto wijzen die er niet meer is.

**Nog niet gedaan:** de persoon ziet die foto nog niet. Medicatie bereikt
haar scherm als `agenda_event` met `kind = 'med'`, en dat event draagt geen
`photo_path`. De foto is dus voorlopig alleen voor familie.

## Medicatie: wat er bevestigd werd

`medication_log` hield al bij wanneer een moment bevestigd werd en door
wie (`confirmed_by`), maar dat werd nergens teruggelezen. Migratie
`25_medication_history.sql` maakt er iets van:

- **`medication_change`** — een geschiedenis van het schema, gevuld door
  een trigger op `medication`, niet door de app. Zo kan er niets gemist
  worden, ook niet bij een wijziging via SQL. Eén rij per veld dat echt
  veranderde; een nieuwe foto telt niet mee.
- **Voorraad** — `stock_doses` op `medication`. Elke bevestiging trekt er
  één af, twee keer bevestigen kost geen twee doses, en terugzetten geeft
  er één terug. Leeg betekent: niet bijgehouden.
- **`medication_history()`** — de momenten met wie bevestigde, afgeleid
  uit de rol binnen dat huishouden: zelf, familie of zorgverlener.
- **`medication_summary()`** — per tijdstip en in totaal: bevestigd,
  waarvan zelf, en over hoeveel dagen die cijfers gaan.

Dat laatste is het punt. Eén percentage verbergt twee dingen: dat de
avonddosis het probleem is en niet de ochtend, en dat een gelijkblijvend
totaal een groeiende afhankelijkheid kan verbergen wanneer familie steeds
vaker bevestigt in plaats van de persoon zelf.

**Bevestigd is niet ingenomen.** Dit legt vast dat er op een knop gedrukt
is. Dat staat in de database-commentaar, op het scherm en hoort ook op elk
verslag te staan.

## De indeling van het dagscherm

Niet elk huishouden heeft hetzelfde nodig. Op `/familie/indeling` stelt
familie samen welke blokken op het dagscherm van de persoon staan, in welke
volgorde en hoe groot. Het verandert meteen op de tablet; niemand hoeft die
aan te raken.

Het model is **volgorde en grootte, nooit posities**:

```json
{ "versie": 1, "tegels": [
    { "id": "nu",        "maat": "vol"  },
    { "id": "daarna",    "maat": "vol"  },
    { "id": "berichten", "maat": "half" }
] }
```

Dat is de hele truc. Met x/y klopt een indeling alleen op het scherm waarop
ze gemaakt is: draait de tablet, zet de persoon de tekst groter, of bewerkt
familie het op een telefoon, dan schuift alles over elkaar. Met volgorde en
grootte kan niets overlappen, blijven er geen gaten staan, herschikt het
zich vanzelf — en is de volgorde in de code per definitie gelijk aan wat je
ziet, wat voor de voorleesfunctie en het toetsenbord de volgorde is die
telt. Het rooster in `index.css` is daardoor vier regels: één kolom smal,
twee vanaf 40rem, één bij grote tekst.

De standaardindeling is één grote kaart bovenaan en daaronder vier halve,
zodat een tablet twee kolommen toont zoals het scherm er voorheen liggend
uitzag. Een telefoon krijgt alles vol-breed. Vanaf 48rem zijn er twee
kolommen en mag het scherm tot 52rem breed worden — met twee kolommen
bepaalt de kolom de regellengte, niet het venster, dus de smalle band uit
het oude ontwerp is daar niet meer nodig.

### Als de migratie nog niet gedraaid is

Zonder `27_layout.sql` bestaat de kolom `home_layout` niet en geeft
PostgREST 42703. Dat vulde de console met 400's: elk scherm vroeg het
opnieuw en react-query probeerde het elke keer nog twee keer.

`getIndeling()` herkent die ene fout nu, onthoudt hem in
`indelingKolomOntbreekt()` en geeft verder de standaardindeling terug
zonder nog iets te vragen. Het scherm van de persoon werkt dus gewoon; de
editor zegt bovenaan welke migratie er nog moet. Een echte fout
(rechten, netwerk) gaat wel gewoon door — alleen deze ene wordt als
"migratie volgt nog" behandeld. Zie `src/services/layout.test.ts`.

### Sjablonen

`SJABLONEN` in `modules.ts` geeft vier indelingen in één tik — **Rustig**,
**Standaard**, **Twee kolommen** en **Alles** — als vertrekpunt; daarna
past familie losse tegels aan. Losse tegels aanzetten werkt ook, maar dan
moet je zelf bedenken wat samen een goed geheel is.

"Twee kolommen" zet alles op half, zodat de inhoud op een tablet in twee
echte kolommen doorloopt — het liggende scherm van voorheen. Op een
telefoon wordt datzelfde sjabloon vanzelf één kolom. Dat is de winst van
volgorde-en-grootte boven vaste posities: één keuze die op elk scherm
klopt.

Een test controleert dat elk sjabloon ongewijzigd door `normaliseer()`
komt. Doet het dat niet, dan springt het scherm meteen terug na het
aantikken en lijkt het sjabloon stuk.

### Kolommen, geen rijen

Op een breed scherm is het dagscherm een **kolomstroom** (CSS multi-column),
geen rooster van rijen. Dat verschil is het hele punt: in een rooster
bepaalt de langste tegel de hoogte van de rij, dus naast de grote
"Nu"-kaart bleef een halve kolom leeg. Met kolommen loopt de inhoud door —
tegel voor tegel de eerste kolom vol, dan de tweede — zonder gaten.

De leesvolgorde blijft die van de code: eerst de linkerkolom van boven naar
beneden, dan de rechter. Voorlezen en toetsenbord volgen dus wat je ziet.
Dat is precies waarom dit met kolommen kan en met vrije posities niet.

Een `vol`-tegel krijgt `column-span: all` en knipt de stroom in tweeën; wat
erna komt begint aan een nieuwe kolomreeks. Smal en bij grote tekst gaat
het terug naar één kolom in een gewoon rooster.

"Wat nu?" mag daarom óók half: de kaart staat dan bovenaan de linkerkolom
met de dag eronder. Bovenaan blijft bovenaan — in twee kolommen is dat
linksboven, en daar begin je te lezen.

Welke modules er bestaan staat in `MODULE_IDS`, en `Today.tsx` typeert
zijn blokken als `Record<ModuleId, ReactNode>`. Komt er een module bij
zonder dat er iets getekend wordt, dan faalt de build — in plaats van dat
familie een tegel kan kiezen die leeg blijft.

De regels staan in `src/features/layout/modules.ts`:

- **"Wat nu?" staat altijd bovenaan en kan niet weg.** Dat is de vraag waar
  de app om draait; die hoort niet per huishouden ergens anders te staan.
  Half mag wel — zie hierboven.
- **Geen maximum aantal tegels, wel een raad.** Boven `RUSTIG_TOT` (zes)
  zegt de editor dat elke tegel erbij één keuze meer is die zij tegelijk
  ziet, en blokkeert verder niets. Er stond eerst een harde grens op zes;
  die is eruit, omdat familie het huishouden beter kent dan de app. De
  database houdt alleen een ruime bovengrens aan als foutdetectie.
- **Sommige blokken kunnen nooit half** — een tijdlijn of een rij knoppen
  wordt in een halve kolom onleesbaar.
- **Bij grote tekst of eenvoudige modus worden halve tegels vanzelf
  vol-breed.** Familie hoeft daar niet aan te denken; de editor biedt half
  dan niet eens aan.

`normaliseer()` past die regels toe en draait op twee plaatsen: in de
editor, zodat familie niets kan bewaren dat niet kan, en op het scherm van
de persoon, zodat een oude of half kapotte indeling daar nooit iets stuk
maakt. Die tweede is de belangrijkste — dat scherm hoort altijd te werken,
dus een onbekende module verdwijnt er stilletjes in plaats van een
foutmelding te tonen. Daar staan tests op.

Tikken, niet slepen. Slepen is op een telefoon lastig, met een toetsenbord
onmogelijk en met de voorleesfunctie niet te doen — en familie zit vaak op
een telefoon.

Bewaard in `household.home_layout`, net als de weergave-instellingen, en
eerst gelezen uit localStorage: op de tablet is verspringende tekst erger
dan een halve seconde oude informatie. Zorgverleners kunnen het niet
wijzigen; de persoon zelf wel.

## Analyse en het verslag voor de dokter

`/familie/analyse` is één scherm dat twee dingen doet: familie kan het hele
jaar door kijken hoe het gaat, en wat daar aangevinkt staat, komt op het
verslag voor de arts. Het verslag is dus geen apart product maar een afdruk
van wat er al staat — anders bouw je twee keer dezelfde cijfers, die dan
uiteen gaan lopen.

Alles komt uit `26_analyse.sql` en rekent met gegevens die de app toch al
bewaart. Er komt geen nieuwe registratie bij.

- **`analyse_dagritme()`** — per maand het tijdstip van de eerste
  afgevinkte activiteit, met de vroegste, de mediaan en de laatste. De
  spreiding is het signaal, niet het gemiddelde: "ontbijt rond 8 uur" zegt
  niets, "tussen 7:40 en 9:15 in juli, tussen 6:20 en 11:05 in september"
  wel.
- **`analyse_weekpatroon()`** — per dag van de week. Dit blok voorkomt de
  grootste misinterpretatie: klopt alles op zondag omdat de dochter er dan
  is, dan meet je bezoek en geen zelfstandigheid.
- **`analyse_activiteit()`** — per uur, alleen handelingen door de persoon
  zelf. Bewust geen slaapmeting; iemand kan wakker liggen zonder het scherm
  aan te raken. Wat het wel laat zien, is of er 's nachts iets gebeurt dat
  er eerder niet was.
- **`analyse_dekking()`** — over hoeveel dagen de cijfers eigenlijk gaan.
  Een tablet die twaalf dagen uit stond maakt elk percentage misleidend,
  dus dit staat altijd bovenaan en gaat altijd mee op het verslag.

Drie regels, overal:

1. **Nooit één getal zonder de spreiding of de dekking erbij.**
2. **Beschrijven, nooit oordelen.** De functies geven tellingen en
   tijdstippen. Geen score, geen trend, geen "achteruitgang". Wat het
   betekent, beslist een mens.
3. **Wat niet beschikbaar is, staat er grijs bij met de reden.** Een blok
   stilletjes weglaten laat het scherm stuk lijken en verbergt de keuze
   erachter.

`watStabielBleef()` vergelijkt de eerste helft van de periode met de
tweede. Zonder dat blok leest elk verslag als achteruitgang, ook wanneer er
niets aan de hand is. Onder vijf momenten per helft zegt het niets: liever
geen regel dan "stabiel" op drie metingen. Dat zit in
`src/services/analyse.test.ts`, omdat deze regels bij een arts terechtkomen.

De keuze van blokken staat in `household.report_prefs` en niet op het
account: het gaat over deze persoon, niet over wie toevallig inlogt. Eén
keer kiezen, daarna elke consultatie dezelfde samenstelling — verandert het
verslag elke keer, dan kan een arts niets vergelijken. Alleen familie
(`admin` of `member`) kan het samenstellen; alle analysefuncties volgen
`mag_meekijken()`.

### Het verslag

`/verslag` staat buiten de familie-opmaak, net als het levensboek: op papier
hoort er geen zijbalk bij en een arts krijgt geen navigatie te zien. De knop
"Verslag maken" staat op het analysescherm en geeft de gekozen periode mee
in de URL.

De pagina **rekent niets uit**. Ze haalt dezelfde cijfers uit dezelfde hook
(`useAnalyse`) en drukt af wat aangevinkt staat. Zou ze eigen queries doen,
dan ligt er bij de arts vroeg of laat iets anders dan wat familie zag.
`BLOKKEN` in `blokken.ts` is om dezelfde reden één lijst voor beide
schermen.

Op papier geen balken en geen kleuren: browsers laten achtergronden weg bij
het afdrukken, en een arts leest liever een getal met de teller en de noemer
erbij. Het worden tabellen, alles zwart — ook wat op het scherm grijs is,
want een verslag wordt gekopieerd en lichtgrijs overleeft dat niet. De
tabelkoppen herhalen zich bovenaan een volgend blad (`display:
table-header-group`) en een rij valt nooit over twee bladen.

Er staat geen PDF-bibliotheek in de bundel: de browser maakt de PDF via
"Opslaan als PDF" in het printvenster. Werkt op een beheerde computer zonder
installatie, en familie ziet vooraf precies wat ze krijgt.

Drie dingen staan er altijd op, ook als familie ze niet zou aanvinken:

- **De dekking** — zonder het aantal dagen is elk percentage misleidend.
- **Wat "bevestigd" wel en niet betekent** — bovenáán, vóór de cijfers. Wie
  de kop leest en doorbladert, moet die beperking al gezien hebben.
- **Wat er niet op staat.** Met het onderscheid tussen *weggelaten door
  familie* (die gegevens bestaan) en *geen gegevens* (er is niets
  vastgelegd). Dat verschil betekent voor een arts iets heel anders. Zonder
  deze regel cureert familie zonder het te beseffen wat de arts ziet, en
  weet de arts niet wat hij mist. Zie `nietOpgenomen()` en de tests ernaast.

## Waarom het scherm van de persoon niet mag omvallen

Er ging één keer iets mis waar drie fouten achter zaten, en ze zijn alle
drie gerepareerd. Het is het soort ketting dat terugkomt, dus het staat
hier.

De tablet toonde "Er ging iets mis — Cannot read properties of undefined
(reading 'nav.vandaag')" en bleef dat tonen, ook na herladen.

1. **De bewaarde query-cache werd nooit weggegooid.** De `buster` stond op
   `import.meta.env.VITE_BUILD_ID ?? "dev"`, en die variabele was nergens
   gezet — dus was de buster bij elke versie "dev" en bleef een cache van
   een oudere versie staan. Nu komt het bouwnummer uit `vite.config.ts`
   (`__BUILD_ID__`), zodat het altijd verandert, ook als niemand een
   omgevingsvariabele zet.
2. **Een onvolledig object ging ongecontroleerd naar `pasToe()`.** Die
   oude cache gaf een instellingenobject van de oude vorm terug, zonder
   `taal`. Nu gaat alles door `volledig()`, dat altijd elk veld invult —
   of het nu uit de database, uit localStorage of uit de cache komt.
3. **`t()` viel om op een onbekende taal.** `WOORDENBOEKEN[huidige][sleutel]`
   met `huidige` undefined is een harde fout, en `t()` draait op élk
   scherm. Eén lege waarde nam dus de hele app mee. Nu valt elke stap
   terug, tot en met de sleutel zelf, en weigert `zetTaal()` een taal die
   niet bestaat.

De les zit in nummer drie. Deze module had al in haar eigen commentaar
staan: "beter een zin in de verkeerde taal dan een lege knop" — en deed
vervolgens het tegenovergestelde. Op het scherm van de persoon is
terugvallen op iets lelijks altijd beter dan stoppen. Dat geldt ook voor
`normaliseer()` in de indeling, en voor elke functie die daar draait.

Er staan tests op alle drie: `src/lib/i18n.test.ts` en
`src/features/settings/volledig.test.ts`.

## Wit scherm na een nieuwe versie

Een browser kan na een deploy nog een oude `index.html` hebben — uit de
service worker of uit zijn eigen cache. Die verwijst naar bestanden die op
de server niet meer bestaan. Cloudflare Pages stuurt voor elk onbekend
adres `index.html` terug, de browser weigert dat als script of stylesheet
("Expected a JavaScript-or-Wasm module script but the server responded with
a MIME type of text/html"), en er verschijnt niets.

Op een computer los je dat op met een harde herlading. Op de tablet in de
keuken is er niemand die dat weet, dus doet de app het zelf. In
`index.html` staat een kleine bewaker die luistert of een bestand onder
`/assets/` niet laadt; gebeurt dat, dan gooit hij de service worker en de
caches weg en laadt één keer opnieuw.

Twee dingen die daaraan vastzitten, en allebei zijn ze getest:

- **Precies één keer**, bewaakt met `sessionStorage`. Een herlaadlus is
  erger dan een wit scherm: daar komt niemand nog uit.
- **Alleen onze eigen bestanden.** Eerst keek de bewaker naar elke
  mislukte `<script>` of `<link>`, en dan herlaadde hij ook wanneer alleen
  het lettertype van Google niet binnenkwam — offline of op een netwerk dat
  Google Fonts blokkeert. De app werkt dan gewoon, met een ander lettertype.

De service worker neemt nu ook meteen over (`skipWaiting`, `clientsClaim`,
`cleanupOutdatedCaches`) in plaats van te wachten tot elk tabblad gesloten
is. Op een tablet die maandenlang aan staat gebeurt dat laatste nooit.

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
