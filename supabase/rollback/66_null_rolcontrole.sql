-- Terugdraaien van 66_null_rolcontrole.sql: de elf functies zoals ze waren.
-- LET OP: dit zet het lek terug open.

CREATE OR REPLACE FUNCTION public.assign_task(t uuid, wie uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hh uuid;
  wat text;
  naam text;
begin
  select household_id, title into hh, wat from public.task where id = t;
  if hh is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;

  if wie is not null and not exists (
    select 1 from public.membership
     where household_id = hh and profile_id = wie and role in ('admin', 'member')
  ) then
    raise exception 'Die persoon hoort niet bij de familie van dit huishouden';
  end if;

  update public.task set assignee = wie where id = t;

  -- Zichzelf iets toewijzen hoeft geen melding.
  if wie is not null and wie <> auth.uid() then
    select coalesce(full_name, 'Iemand') into naam from public.profile where id = auth.uid();
    insert into public.notification (household_id, level, body, target_profile)
    values (hh, 'info', format('%s vroeg je: %s', naam, wat), wie);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_task(t uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hh uuid;
begin
  select household_id into hh from public.task where id = t;
  if hh is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;

  -- Alleen een taak die nog vrij is. Wie tegelijk drukt, krijgt een
  -- nette melding in plaats van andermans taak af te pakken.
  update public.task set assignee = auth.uid()
   where id = t and assignee is null and done_at is null;

  if not found then
    raise exception 'Deze taak is ondertussen al opgenomen';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_task(t uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.task;
  volgende date;
  nieuw uuid;
begin
  select * into r from public.task where id = t;
  if r.id is null or public.auth_role(r.household_id) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;
  if r.done_at is not null then
    return null;
  end if;

  update public.task
     set done_at = now(), done_by = auth.uid()
   where id = t;

  if r.repeat = 'none' then
    return null;
  end if;

  -- Terugkerend: vanaf de vervaldag tellen, niet vanaf vandaag. Wie de
  -- boodschappen twee dagen te laat doet, blijft op zijn vaste dag zitten.
  volgende := (coalesce(r.due_on, current_date) + case r.repeat
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    else interval '1 month'
  end)::date;

  insert into public.task (household_id, title, note, assignee, due_on, repeat, created_by)
  values (r.household_id, r.title, r.note, r.assignee, volgende, r.repeat, r.created_by)
  returning id into nieuw;

  return nieuw;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_pairing_code(hh uuid)
 RETURNS TABLE(code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c    text;
  rij  public.device_pairing;
begin
  if public.auth_role(hh) is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een tablet koppelen';
  end if;

  -- Eén geldige code per huishouden tegelijk: een oude code die nog rondslingert,
  -- vervalt zodra er een nieuwe gemaakt wordt.
  -- De kolommen expliciet via een alias: "code" en "expires_at" zijn ook
  -- de namen van wat deze functie teruggeeft, en zonder alias weet
  -- Postgres niet welke van de twee bedoeld is. Dat gaf een fout 400.
  update public.device_pairing dp
     set expires_at = now()
   where dp.household_id = hh and dp.used_at is null and dp.expires_at > now();

  -- Acht cijfers: honderd miljoen mogelijkheden in een venster van tien
  -- minuten, en toch nog makkelijk over te tikken als 4821 9037.
  loop
    c := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (select 1 from public.device_pairing d where d.code = c);
  end loop;

  insert into public.device_pairing (household_id, code, created_by)
  values (hh, c, auth.uid())
  returning * into rij;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Koppelcode voor de tablet aangemaakt', auth.uid(), 'family');

  return query select rij.code, rij.expires_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dag_klaarzetten(hh uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tz       text;
  vandaag  date;
  morgen   date;
  n        integer := 0;
begin
  -- Familie, niet de persoon: dit maakt items op haar scherm aan.
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan de dag klaarzetten';
  end if;

  select timezone into tz from public.household where id = hh;
  if tz is null then
    raise exception 'Onbekend huishouden';
  end if;

  vandaag := (now() at time zone tz)::date;
  morgen  := vandaag + 1;

  n := public.materialise_day(hh, morgen);

  -- Vandaag alleen als er nog niets staat.
  --
  -- materialise_day zegt het zelf: verwijdert familie een item van vandaag,
  -- dan zet een herhaling het terug. Dat mag niet gebeuren omdat iemand
  -- toevallig het dashboard opent. Staat de dag helemaal leeg, dan is er
  -- niets om terug te zetten en is het veilig.
  if not exists (
    select 1 from public.agenda_event ae
     where ae.household_id = hh
       and (ae.starts_at at time zone tz)::date = vandaag
  ) then
    n := n + public.materialise_day(hh, vandaag);
  end if;

  perform public.ensure_medication_log(hh, vandaag);
  perform public.ensure_medication_log(hh, morgen);

  return n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.laat_los(gebeurtenis uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hh  uuid;
  wie uuid;
begin
  select household_id, claimed_by into hh, wie
    from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets loslaten';
  end if;
  -- Alleen je eigen toezegging terugnemen. Wie iets van een ander afneemt,
  -- laat die ander in de veronderstelling dat het geregeld is.
  if wie is distinct from auth.uid() then
    raise exception 'Dat heeft iemand anders opgenomen';
  end if;

  update public.agenda_event set claimed_by = null where id = gebeurtenis;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.neem_op(gebeurtenis uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hh uuid;
begin
  select household_id into hh from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets opnemen';
  end if;

  update public.agenda_event
     set claimed_by = auth.uid()
   where id = gebeurtenis;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.plan_bezoek(hh uuid, dag date, uur time without time zone DEFAULT '14:00:00'::time without time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  zone   text;
  naam   text;
  nieuw  uuid;
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een bezoek plannen';
  end if;

  select timezone into zone from public.household where id = hh;
  select coalesce(nullif(btrim(full_name), ''), 'Familie') into naam
    from public.profile where id = auth.uid();

  insert into public.agenda_event
    (household_id, starts_at, title, emoji, kind, claimed_by, created_by)
  values (
    hh,
    ((dag + uur) at time zone coalesce(zone, 'Europe/Brussels')),
    naam || ' komt langs',
    '👋',
    'visit',
    auth.uid(),
    auth.uid()
  )
  returning id into nieuw;

  return nieuw;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_alert_channel(hh uuid, soort text, adres text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ruw    text := trim(coalesce(adres, ''));
  cijfer text;
  schoon text;
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een kanaal instellen';
  end if;
  if soort not in ('whatsapp', 'telegram') then
    raise exception 'Onbekend kanaal: %', soort;
  end if;

  if ruw = '' then
    delete from public.alert_channel
     where profile_id = auth.uid() and kind = soort;
    return;
  end if;

  -- Alles weg wat geen cijfer is, en dan opnieuw opbouwen. Een lijst van te
  -- verwijderen tekens ("spatie, streepje, punt") is altijd te kort: bij de
  -- eerste test kwam er een schuine streep uit — 0032 475/12.34.56 — en die
  -- stond er niet in. Omgekeerd redeneren kan niet te kort zijn.
  cijfer := regexp_replace(ruw, '[^0-9]', '', 'g');

  if soort = 'whatsapp' then
    -- Een bericht naar het verkeerde nummer is erger dan geen bericht, dus
    -- alleen vormen die niet te raden zijn:
    --   +32475123456  al goed
    --   0032475123456 internationaal met 00
    --   0475123456    een Belgisch nummer; alleen hier vullen we +32 aan
    if left(ruw, 1) = '+' then
      schoon := '+' || cijfer;
    elsif cijfer ~ '^00[1-9][0-9]{6,14}$' then
      schoon := '+' || substring(cijfer from 3);
    elsif cijfer ~ '^0[1-9][0-9]{7,8}$' then
      schoon := '+32' || substring(cijfer from 2);
    else
      raise exception 'Zet het nummer in internationaal formaat, bijvoorbeeld +32475123456';
    end if;

    if schoon !~ '^\+[1-9][0-9]{6,14}$' then
      raise exception 'Zet het nummer in internationaal formaat, bijvoorbeeld +32475123456';
    end if;
  else
    -- Een Telegram chat-id is een getal, negatief voor een groep.
    schoon := case when left(ruw, 1) = '-' then '-' || cijfer else cijfer end;
    if schoon !~ '^-?[0-9]{5,20}$' then
      raise exception 'Een Telegram chat-id is een getal, bijvoorbeeld 123456789';
    end if;
  end if;

  insert into public.alert_channel (household_id, profile_id, kind, address)
  values (hh, auth.uid(), soort, schoon)
  on conflict (profile_id, kind) do update
    set address = excluded.address, household_id = excluded.household_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_medication_stock(med uuid, doses integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hh uuid;
begin
  select household_id into hh from public.medication where id = med;
  if hh is null then
    raise exception 'Onbekend medicijn';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan de voorraad bijwerken';
  end if;
  if doses is not null and doses < 0 then
    raise exception 'Een voorraad kan niet negatief zijn';
  end if;

  update public.medication
     set stock_doses = doses,
         stock_updated_at = case when doses is null then null else now() end
   where id = med;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_report_prefs(hh uuid, prefs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  nieuw jsonb;
begin
  -- Alleen familie: het verslag is hun voorbereiding op de consultatie.
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan het verslag samenstellen';
  end if;

  update public.household
     set report_prefs = coalesce(report_prefs, '{}'::jsonb) || coalesce(prefs, '{}'::jsonb)
   where id = hh
   returning report_prefs into nieuw;

  return nieuw;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_medication_today(hh uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tz         text;
  vandaag    date;
  med        record;
  tijdstip   time;
  dag_extra  integer;
  moment     timestamptz;
begin
  if public.auth_role(hh) is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan het medicatieschema wijzigen';
  end if;

  select timezone into tz from public.household where id = hh;
  vandaag := (now() at time zone tz)::date;

  -- Toekomstige momenten die niet meer kloppen, gaan weg: een gestopt
  -- medicijn of een verschoven uur. Wat al genomen is, blijft staan.
  delete from public.medication_log ml
   where ml.household_id = hh
     and ml.taken_at is null
     and ml.due_at > now()
     and not exists (
       select 1
       from public.medication m,
            unnest(coalesce(m.at_times, array[m.at_time])) as u(tijd)
       where m.id = ml.medication_id
         and m.active
         and ((((ml.due_at at time zone tz)::date) + u.tijd) at time zone tz) = ml.due_at
     );

  -- Nieuwe momenten, voor vandaag en morgen, alleen in de toekomst.
  for med in select * from public.medication where household_id = hh and active loop
    foreach tijdstip in array coalesce(med.at_times, array[med.at_time]) loop
      for dag_extra in 0..1 loop
        moment := ((vandaag + dag_extra) + tijdstip) at time zone tz;
        if moment > now() then
          insert into public.medication_log (medication_id, household_id, due_at)
          values (med.id, hh, moment)
          on conflict (medication_id, due_at) do nothing;
        end if;
      end loop;
    end loop;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.test_push(hh uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een testmelding sturen';
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = 'test';

  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'warn', 'Test: als je dit ziet, komen de dringende meldingen aan.', null, 'test');
end;
$function$
;

