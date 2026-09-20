-- =====================================================================
--  THUIS — demo-data
--  Het huishouden van Maria Janssens, hetzelfde als in het prototype.
--
--  Draai dit NA 01_schema.sql, in de SQL-editor.
--  Vereist: één account dat al ingelogd is geweest, zodat er een rij in
--  auth.users staat. Vul hieronder het e-mailadres van dat account in;
--  die persoon wordt de familiebeheerder (de rol van Els).
--
--  Opnieuw draaien maakt een tweede huishouden aan. Wil je opnieuw
--  beginnen, verwijder dan eerst het oude huishouden — alles hangt eraan
--  met on delete cascade:
--    delete from public.household where person_name = 'Maria Janssens';
-- =====================================================================

do $$
declare
  v_email    text := 'vervang@door-jouw-email.be';   -- << pas dit aan
  v_tz       text := 'Europe/Brussels';
  v_admin    uuid;
  hh         uuid;
  c_els      uuid;
  c_jan      uuid;
  c_sofie    uuid;
  c_rita     uuid;
  c_lut      uuid;
  c_dokter   uuid;
  r_ochtend  uuid;
  r_namiddag uuid;
  r_avond    uuid;
  rm_woon    uuid;
  rm_keuken  uuid;
  rm_slaap   uuid;
  rm_bad     uuid;
  rm_garage  uuid;
  rm_tuin    uuid;
  it         uuid;
  med_met    uuid;
  med_bloed  uuid;
  med_vitd   uuid;
  med_drup   uuid;
begin
  select id into v_admin from auth.users where email = v_email;
  if v_admin is null then
    raise exception 'Geen account gevonden voor %. Log eerst één keer in met dat adres, of pas v_email aan.', v_email;
  end if;

  insert into public.profile (id, full_name, phone)
  values (v_admin, 'Els Vandenberghe', '0475 12 34 56')
  on conflict (id) do nothing;

  -- huishouden en beheerder ------------------------------------------
  insert into public.household (person_name, address, timezone)
  values ('Maria Janssens', 'Lindestraat 12, Herent', v_tz)
  returning id into hh;

  insert into public.membership (household_id, profile_id, role)
  values (hh, v_admin, 'admin');

  insert into public.location_setting (household_id, enabled, radius_m)
  values (hh, false, 500);

  -- wie is wie --------------------------------------------------------
  insert into public.person_card (household_id, name, relation, kind, emoji, color, description, detail, sort)
  values (hh, 'Maria', 'Jij', 'self', '🌷', '#8A6A3B', 'Dit ben jij.', null, 0);

  insert into public.person_card (household_id, profile_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, v_admin, 'Els', 'Dochter', 'family', '👩', '#B4762A', '0475 12 34 56',
          'Els is je oudste dochter. Ze woont in Leuven, op twintig minuten rijden.',
          'Ze belt elke avond rond 19:00. Ze rijdt je naar de dokter.', 1)
  returning id into c_els;

  insert into public.person_card (household_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, 'Jan', 'Zoon', 'family', '👨', '#3C6684', '0476 98 76 54',
          'Jan is je zoon. Hij woont in Antwerpen met Karen en de kleinkinderen.',
          'Hij komt meestal op zaterdag langs met de hond, Balu.', 2)
  returning id into c_jan;

  insert into public.person_card (household_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, 'Sofie', 'Dochter', 'family', '👧', '#3F7355', '0478 55 44 33',
          'Sofie is je jongste dochter. Ze woont in Gent.',
          'Ze stuurt elke week foto''s van haar tuin.', 3)
  returning id into c_sofie;

  insert into public.person_card (household_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, 'Rita', 'Buurvrouw', 'contact', '🏡', '#8A5A7A', '016 22 11 00',
          'Rita is je buurvrouw. Ze woont in het huis met de blauwe deur.',
          'Rita heeft een reservesleutel van je voordeur.', 4)
  returning id into c_rita;

  insert into public.person_card (household_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, 'Lut', 'Thuisverpleging', 'care', '💙', '#2F6B6B', '016 40 30 20',
          'Lut komt van de thuisverpleging.',
          'Ze komt op maandag en donderdag in de voormiddag.', 5)
  returning id into c_lut;

  insert into public.person_card (household_id, name, relation, kind, emoji, color, phone, description, detail, sort)
  values (hh, 'Dr. Janssens', 'Huisarts', 'care', '🩺', '#A8442F', '016 12 34 56',
          'Dr. Janssens is je huisarts.',
          'Praktijk in de Dorpsstraat 8. Consultatie op afspraak.', 6)
  returning id into c_dokter;

  -- routines ----------------------------------------------------------
  insert into public.routine (household_id, name, emoji, rrule)
  values (hh, 'Ochtend', '🌅', 'FREQ=DAILY') returning id into r_ochtend;
  insert into public.routine_step (routine_id, household_id, at_time, title, emoji, sort) values
    (r_ochtend, hh, '07:30', 'Opstaan',   '🌅', 0),
    (r_ochtend, hh, '08:00', 'Ontbijten', '☕', 1),
    (r_ochtend, hh, '08:30', 'Medicatie nemen', '💊', 2),
    (r_ochtend, hh, '09:00', 'Radio aan', '📻', 3);

  insert into public.routine (household_id, name, emoji, rrule)
  values (hh, 'Namiddag', '🌤️', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') returning id into r_namiddag;
  insert into public.routine_step (routine_id, household_id, at_time, title, emoji, sort) values
    (r_namiddag, hh, '12:30', 'Lunch',      '🍽️', 0),
    (r_namiddag, hh, '14:30', 'Even rusten', '🛋️', 1),
    (r_namiddag, hh, '15:30', 'Wandeling',  '🚶', 2);

  insert into public.routine (household_id, name, emoji, rrule)
  values (hh, 'Avond', '🌙', 'FREQ=DAILY') returning id into r_avond;
  insert into public.routine_step (routine_id, household_id, at_time, title, emoji, sort) values
    (r_avond, hh, '18:00', 'Avondeten', '🍲', 0),
    (r_avond, hh, '19:00', 'Els belt op', '📞', 1),
    (r_avond, hh, '21:00', 'Medicatie nemen', '💊', 2),
    (r_avond, hh, '22:00', 'Slapen', '🌙', 3);

  insert into public.routine (household_id, name, emoji, rrule)
  values (hh, 'Zondagbezoek', '🍰', 'FREQ=WEEKLY;BYDAY=SU');

  -- de dag van vandaag -------------------------------------------------
  insert into public.agenda_event (household_id, starts_at, title, emoji, kind, note, person_id, routine_id, done_at) values
    (hh, (current_date + time '07:30') at time zone v_tz, 'Opstaan', '🌅', 'routine',
      'Rustig aan. De pantoffels staan naast het bed.', null, r_ochtend,
      (current_date + time '07:35') at time zone v_tz),
    (hh, (current_date + time '08:00') at time zone v_tz, 'Ontbijten', '☕', 'meal',
      'Neem rustig de tijd.', null, r_ochtend,
      (current_date + time '08:40') at time zone v_tz),
    (hh, (current_date + time '08:30') at time zone v_tz, 'Medicatie nemen', '💊', 'med',
      'De doos staat in de keuken, naast de koffie.', null, r_ochtend, null),
    (hh, (current_date + time '10:30') at time zone v_tz, 'Els komt langs', '👩', 'visit',
      'Els blijft koffie drinken.', c_els, null, null),
    (hh, (current_date + time '12:30') at time zone v_tz, 'Lunch', '🍽️', 'meal',
      'Er staat soep in de koelkast.', null, r_namiddag, null),
    (hh, (current_date + time '14:00') at time zone v_tz, 'Dokter Janssens', '🩺', 'appt',
      'Els brengt je met de auto. Ze belt aan om 13:30.', c_dokter, null, null),
    (hh, (current_date + time '15:30') at time zone v_tz, 'Wandeling', '🚶', 'routine',
      'Een rondje door het park, met de jas aan.', null, r_namiddag, null),
    (hh, (current_date + time '18:00') at time zone v_tz, 'Avondeten', '🍲', 'meal',
      null, null, r_avond, null),
    (hh, (current_date + time '19:00') at time zone v_tz, 'Els belt op', '📞', 'visit',
      'Els belt elke avond even.', c_els, r_avond, null),
    (hh, (current_date + time '21:00') at time zone v_tz, 'Medicatie nemen', '💊', 'med',
      'De avonddruppels.', null, r_avond, null),
    (hh, (current_date + time '22:00') at time zone v_tz, 'Slapen', '🌙', 'routine',
      null, null, r_avond, null);

  -- het huis -----------------------------------------------------------
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Woonkamer', '🛋️', 0) returning id into rm_woon;
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Keuken', '🍳', 1) returning id into rm_keuken;
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Slaapkamer', '🛏️', 2) returning id into rm_slaap;
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Badkamer', '🚿', 3) returning id into rm_bad;
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Garage', '🚗', 4) returning id into rm_garage;
  insert into public.room (household_id, name, emoji, sort) values (hh, 'Tuin', '🌿', 5) returning id into rm_tuin;

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_keuken, 'Koffiezetapparaat', '☕', 'Op het aanrecht, rechts van de gootsteen.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Vul het waterreservoir tot de streep.'),
    (it, hh, 1, 'Zet een kopje onder de tuit.'),
    (it, hh, 2, 'Druk op de grote knop met het kopje.'),
    (it, hh, 3, 'Wacht tot het geluid stopt.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_keuken, 'Wasmachine', '🧺', 'In de bijkeuken, naast de deur.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Doe de was in de trommel.'),
    (it, hh, 1, 'Doe een wasdopje in het bakje links.'),
    (it, hh, 2, 'Draai de knop naar 40 graden.'),
    (it, hh, 3, 'Druk op de startknop rechts.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_keuken, 'Oven', '🔥', 'Onder het aanrecht.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Draai de linkerknop naar 180 graden.'),
    (it, hh, 1, 'Wacht tot het oranje lampje uitgaat.'),
    (it, hh, 2, 'Zet de schotel in het midden.'),
    (it, hh, 3, 'Zet de timer op 20 minuten.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_keuken, 'Medicatiedoos', '💊', 'In de kast boven de koffie. De doos is blauw.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Zoek het vakje van vandaag.'),
    (it, hh, 1, 'Neem de pillen met een glas water.'),
    (it, hh, 2, 'Vink af in de app.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_woon, 'Televisie', '📺', 'De afstandsbediening ligt in het mandje op de salontafel.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Neem de grijze afstandsbediening.'),
    (it, hh, 1, 'Druk op de rode knop bovenaan.'),
    (it, hh, 2, 'Druk op 1 voor één.'),
    (it, hh, 3, 'Volume: de knop met plus en min.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_woon, 'Telefoon', '☎️', 'Op het kastje naast de zetel.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Neem de hoorn van het toestel.'),
    (it, hh, 1, 'Druk op 1 voor Els.'),
    (it, hh, 2, 'Druk op 2 voor Jan.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_woon, 'Thermostaat', '🌡️', 'Aan de muur, naast de deur van de gang.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Draai het wiel naar rechts voor warmer.'),
    (it, hh, 1, '20 graden is een goede temperatuur.'),
    (it, hh, 2, 'Niet hoger dan 22 graden zetten.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_slaap, 'Bril', '👓', 'Op het nachtkastje, in het bruine kokertje.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Kijk eerst op het nachtkastje.'),
    (it, hh, 1, 'Anders: op de tafel in de woonkamer.'),
    (it, hh, 2, 'Anders: bel Els.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_slaap, 'Nachtlampje', '💡', 'Links naast het bed.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Raak de voet van het lampje aan.'),
    (it, hh, 1, 'Nog eens aanraken maakt het feller.'),
    (it, hh, 2, 'Derde keer: uit.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_bad, 'Douche', '🚿', 'De handdoeken liggen in de kast rechts.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Draai de linkerkraan open voor warm water.'),
    (it, hh, 1, 'Wacht even tot het water warm is.'),
    (it, hh, 2, 'De mat ligt al klaar op de vloer.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_garage, 'Reservesleutel', '🔑', 'Rita, de buurvrouw, heeft een reservesleutel.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'Bel aan bij het huis met de blauwe deur.'),
    (it, hh, 1, 'Of bel Rita: 016 22 11 00.');

  insert into public.item (household_id, room_id, name, emoji, where_text, updated_by)
  values (hh, rm_tuin, 'Tuinpoort', '🚪', 'Achteraan de tuin, naast de haag.', v_admin)
  returning id into it;
  insert into public.item_step (item_id, household_id, sort, body) values
    (it, hh, 0, 'De grendel zit bovenaan.'),
    (it, hh, 1, 'Schuif hem naar links.'),
    (it, hh, 2, 'Sluit de poort altijd na het buitengaan.');

  -- memory bank ---------------------------------------------------------
  insert into public.memory_note (household_id, category, title, body, tags, created_by) values
    (hh, 'personen',   'Els', 'Els is je dochter. Ze belt elke avond om 19:00.', '{familie}', v_admin),
    (hh, 'personen',   'Balu', 'Balu is de hond van Jan. Een bruine labrador.', '{familie,dieren}', v_admin),
    (hh, 'plaatsen',   'Huisarts', 'Dr. Janssens, Dorpsstraat 8. Vijf minuten met de auto.', '{zorg}', v_admin),
    (hh, 'plaatsen',   'Bakker', 'De bakker op de hoek, links de straat uit. Open tot 18:00.', '{dagelijks}', v_admin),
    (hh, 'dingen',     'Reservehuissleutel', 'Bij de buurvrouw, Rita.', '{huis}', v_admin),
    (hh, 'dingen',     'Bril', 'Meestal op het nachtkastje in de slaapkamer.', '{huis}', v_admin),
    (hh, 'voorkeuren', 'Koffie', 'Koffie zonder suiker, met een wolkje melk.', '{eten}', v_admin),
    (hh, 'voorkeuren', 'Muziek', 'Houdt van Will Tura en van de radio op de keukenzender.', '{plezier}', v_admin),
    (hh, 'routines',   'Zondag', 'Elke zondag komt Els langs, meestal rond 14:00.', '{week}', v_admin),
    (hh, 'verhalen',   'De bakkerij', 'Maria en Frans hadden 22 jaar een bakkerij in de Dorpsstraat. Ze stond elke ochtend om 4 uur op.', '{vroeger}', v_admin),
    (hh, 'verhalen',   'Spanje', 'De vakantie in Spanje in 1993, met het hele gezin in de gele auto.', '{vroeger}', v_admin);

  -- herinneringen --------------------------------------------------------
  insert into public.memory_photo (household_id, year, title, story, created_by) values
    (hh, 1968, 'Huwelijk met Frans', 'De trouw in de kerk van Herent. Het regende de hele dag.', v_admin),
    (hh, 1972, 'Els wordt geboren', 'Els, het eerste kind. Geboren op een dinsdag in mei.', v_admin),
    (hh, 1975, 'Jan wordt geboren', 'Jan kwam drie jaar later. Hij huilde nooit.', v_admin),
    (hh, 1979, 'Sofie wordt geboren', 'De jongste van het gezin.', v_admin),
    (hh, 1981, 'De bakkerij', 'De opening van de bakkerij in de Dorpsstraat.', v_admin),
    (hh, 1993, 'Vakantie in Spanje', 'Twee weken aan zee, met het hele gezin in de gele auto.', v_admin),
    (hh, 2008, 'Gouden bruiloft', 'Veertig jaar getrouwd, gevierd in de tuin.', v_admin),
    (hh, 2016, 'Kleinkinderen', 'Lotte en Tuur, de kinderen van Jan.', v_admin),
    (hh, 2021, 'Verhuis naar de Lindestraat', 'Het kleine huis met de tuin achteraan.', v_admin);

  -- medicatie ------------------------------------------------------------
  insert into public.medication (household_id, name, dose, at_time, instruction)
  values (hh, 'Metformine', '500 mg', '08:30', 'Bij het ontbijt innemen, met water.') returning id into med_met;
  insert into public.medication (household_id, name, dose, at_time, instruction)
  values (hh, 'Bloeddrukmedicatie', '1 tablet', '08:30', 'Samen met de metformine.') returning id into med_bloed;
  insert into public.medication (household_id, name, dose, at_time, instruction)
  values (hh, 'Vitamine D', '1 capsule', '12:30', 'Bij de lunch.') returning id into med_vitd;
  insert into public.medication (household_id, name, dose, at_time, instruction)
  values (hh, 'Avonddruppels', '10 druppels', '21:00', 'In een half glas water.') returning id into med_drup;

  perform public.ensure_medication_log(hh, current_date);

  -- zorglogboek -----------------------------------------------------------
  insert into public.care_log (household_id, occurred_at, title, note, author_id, source) values
    (hh, (current_date + time '08:15') at time zone v_tz, 'Opgestaan', null, null, 'system'),
    (hh, (current_date + time '08:40') at time zone v_tz, 'Ontbijt genomen', null, null, 'person'),
    (hh, (current_date + time '09:10') at time zone v_tz, 'Telefoon van Sofie', 'Goed gesprek, klonk opgewekt.', v_admin, 'family'),
    (hh, (current_date + time '10:30') at time zone v_tz, 'Bezoek Els', 'Samen de planning van de week overlopen.', v_admin, 'family');

  -- documenten -------------------------------------------------------------
  insert into public.document (household_id, category, name, uploaded_by) values
    (hh, 'identiteit',  'Identiteitskaart (kopie)', v_admin),
    (hh, 'verzekering', 'Hospitalisatieverzekering', v_admin),
    (hh, 'verzekering', 'Brandverzekering woning', v_admin),
    (hh, 'medisch',     'Medicatieschema huisarts', v_admin),
    (hh, 'medisch',     'Verslag cardioloog', v_admin),
    (hh, 'afspraken',   'Zorgplan thuisverpleging', v_admin),
    (hh, 'belangrijk',  'Contactlijst familie', v_admin);

  raise notice 'Huishouden aangemaakt: % (persoon: Maria Janssens, beheerder: %)', hh, v_email;
end
$$;
