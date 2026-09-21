-- =====================================================================
--  THUIS — RLS-tests
--
--  Plak dit in de SQL-editor en draai het. Het maakt tijdelijke gebruikers
--  en een tijdelijk huishouden aan, controleert per rol wie wat mag, en
--  draait alles aan het einde terug met ROLLBACK. Er blijft niets staan.
--
--  Slaagt alles, dan eindigt het met "ALLE RLS-TESTS GESLAAGD". Faalt er
--  één, dan stopt het script met een fout die zegt welke.
--
--  Draai dit opnieuw na elke wijziging aan een policy. Het is het enige
--  wat bewijst dat de zorgverlener de documenten echt niet ziet.
-- =====================================================================

begin;

do $$
declare
  hh        uuid;
  id_admin  uuid := gen_random_uuid();
  id_member uuid := gen_random_uuid();
  id_care   uuid := gen_random_uuid();
  id_person uuid := gen_random_uuid();
  id_vreemd uuid := gen_random_uuid();
  doc_id    uuid;
  ev_id     uuid;
begin
  -- gebruikers
  insert into auth.users (id, email) values
    (id_admin,  'admin@test.be'),
    (id_member, 'member@test.be'),
    (id_care,   'care@test.be'),
    (id_person, 'person@test.be'),
    (id_vreemd, 'vreemd@test.be');

  insert into public.profile (id, full_name) values
    (id_admin, 'Els'), (id_member, 'Jan'), (id_care, 'Lut'),
    (id_person, 'Maria'), (id_vreemd, 'Niemand');

  insert into public.household (person_name, timezone)
  values ('Testpersoon', 'Europe/Brussels') returning id into hh;

  insert into public.membership (household_id, profile_id, role) values
    (hh, id_admin, 'admin'),
    (hh, id_member, 'member'),
    (hh, id_care, 'caregiver'),
    (hh, id_person, 'person');

  insert into public.document (household_id, category, name)
  values (hh, 'identiteit', 'Testdocument') returning id into doc_id;

  insert into public.agenda_event (household_id, starts_at, title, kind)
  values (hh, now(), 'Testafspraak', 'routine') returning id into ev_id;

  insert into public.person_card (household_id, name, relation)
  values (hh, 'Testcontact', 'Buur');

  raise notice 'Opgezet. Huishouden: %', hh;
end
$$;

-- ---------------------------------------------------------------------
--  Een hulpfunctie om als iemand anders te kijken
-- ---------------------------------------------------------------------

create or replace function pg_temp.als(gebruiker text)
returns void
language plpgsql
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = gebruiker;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid, 'role', 'authenticated')::text,
                     true);
end;
$$;

create or replace function pg_temp.verwacht(omschrijving text, werkelijk integer, verwacht integer)
returns void
language plpgsql
as $$
begin
  if werkelijk is distinct from verwacht then
    raise exception 'GEZAKT: % — verwacht %, kreeg %', omschrijving, verwacht, werkelijk;
  end if;
  raise notice 'ok: %', omschrijving;
end;
$$;

set local role authenticated;

-- ---------------------------------------------------------------------
--  Documenten: alleen admin en member
-- ---------------------------------------------------------------------

select pg_temp.als('admin@test.be');
select pg_temp.verwacht('beheerder ziet documenten', count(*)::int, 1) from public.document;

select pg_temp.als('member@test.be');
select pg_temp.verwacht('familielid ziet documenten', count(*)::int, 1) from public.document;

select pg_temp.als('care@test.be');
select pg_temp.verwacht('zorgverlener ziet GEEN documenten', count(*)::int, 0) from public.document;

select pg_temp.als('person@test.be');
select pg_temp.verwacht('de persoon ziet GEEN documenten', count(*)::int, 0) from public.document;

select pg_temp.als('vreemd@test.be');
select pg_temp.verwacht('buitenstaander ziet GEEN documenten', count(*)::int, 0) from public.document;

-- ---------------------------------------------------------------------
--  Agenda: iedereen in het huishouden leest, niemand daarbuiten
-- ---------------------------------------------------------------------

select pg_temp.als('person@test.be');
select pg_temp.verwacht('de persoon ziet haar eigen dag', count(*)::int, 1) from public.agenda_event;

select pg_temp.als('care@test.be');
select pg_temp.verwacht('zorgverlener ziet de dag', count(*)::int, 1) from public.agenda_event;

select pg_temp.als('vreemd@test.be');
select pg_temp.verwacht('buitenstaander ziet de dag NIET', count(*)::int, 0) from public.agenda_event;
select pg_temp.verwacht('buitenstaander ziet het huishouden NIET', count(*)::int, 0) from public.household;
select pg_temp.verwacht('buitenstaander ziet de mensen NIET', count(*)::int, 0) from public.person_card;

-- ---------------------------------------------------------------------
--  Schrijven: de persoon mag niets wijzigen, wel afvinken via de RPC
-- ---------------------------------------------------------------------

do $$
declare
  hh uuid;
  ev uuid;
  gelukt boolean := false;
begin
  select id into hh from public.household where person_name = 'Testpersoon';
  select id into ev from public.agenda_event where household_id = hh limit 1;

  perform pg_temp.als('person@test.be');

  begin
    insert into public.agenda_event (household_id, starts_at, title, kind)
    values (hh, now(), 'Stiekem', 'routine');
    gelukt := true;
  exception when insufficient_privilege or others then
    gelukt := false;
  end;

  if gelukt then
    raise exception 'GEZAKT: de persoon kon een agenda-item toevoegen';
  end if;
  raise notice 'ok: de persoon kan GEEN agenda-item toevoegen';

  perform public.mark_done(ev, true);
  if not exists (select 1 from public.agenda_event where id = ev and done_at is not null) then
    raise exception 'GEZAKT: de persoon kon niet afvinken via mark_done()';
  end if;
  raise notice 'ok: de persoon kan wel afvinken via mark_done()';

  -- En een buitenstaander niet, ook niet met een geldig id.
  perform pg_temp.als('vreemd@test.be');
  begin
    perform public.mark_done(ev, false);
    raise exception 'GEZAKT: een buitenstaander kon afvinken';
  exception when others then
    if sqlerrm like 'GEZAKT%' then
      raise;
    end if;
    raise notice 'ok: een buitenstaander kan niet afvinken';
  end;
end
$$;

-- ---------------------------------------------------------------------
--  Zorglogboek: de zorgverlener schrijft wel, wist niet
-- ---------------------------------------------------------------------

do $$
declare
  hh  uuid;
  log uuid;
begin
  select id into hh from public.household where person_name = 'Testpersoon';

  perform pg_temp.als('care@test.be');
  insert into public.care_log (household_id, title, source)
  values (hh, 'Bezoek thuisverpleging', 'caregiver') returning id into log;
  raise notice 'ok: zorgverlener kan in het logboek schrijven';

  delete from public.care_log where id = log;
  if exists (select 1 from public.care_log where id = log) then
    raise notice 'ok: zorgverlener kan het logboek niet wissen';
  else
    raise exception 'GEZAKT: zorgverlener kon een logboekregel wissen';
  end if;
end
$$;

-- ---------------------------------------------------------------------
--  Rollen: alleen de beheerder wijzigt ze
-- ---------------------------------------------------------------------

do $$
declare
  hh uuid;
  m  uuid;
begin
  select id into hh from public.household where person_name = 'Testpersoon';
  select id into m from public.membership
   where household_id = hh and role = 'caregiver';

  perform pg_temp.als('member@test.be');
  update public.membership set role = 'admin' where id = m;

  if exists (select 1 from public.membership where id = m and role = 'admin') then
    raise exception 'GEZAKT: een familielid kon zichzelf of iemand anders beheerder maken';
  end if;
  raise notice 'ok: een familielid kan geen rollen wijzigen';
end
$$;

-- ---------------------------------------------------------------------
--  Zelfstandige fase: familie kijkt niet mee (vereist 14_ownership.sql)
-- ---------------------------------------------------------------------

reset role;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'household' and column_name = 'support_level') then
    update public.household set support_level = 'zelf' where person_name = 'Testpersoon';
  end if;
end
$$;
set local role authenticated;

do $$
declare
  n integer;
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'household' and column_name = 'support_level') then
    raise notice 'overgeslagen: 14_ownership.sql is nog niet gedraaid';
    return;
  end if;

  perform pg_temp.als('member@test.be');
  select count(*) into n from public.care_log;
  if n <> 0 then
    raise exception 'GEZAKT: familie ziet het logboek in de zelfstandige fase (% rijen)', n;
  end if;
  raise notice 'ok: familie ziet het logboek niet in de zelfstandige fase';

  select count(*) into n from public.agenda_event;
  if n = 0 then
    raise exception 'GEZAKT: familie ziet de agenda niet meer in de zelfstandige fase';
  end if;
  raise notice 'ok: familie ziet wel nog de agenda, om samen te plannen';

  perform pg_temp.als('person@test.be');
  select count(*) into n from public.care_log;
  if n = 0 then
    raise exception 'GEZAKT: de persoon ziet zijn eigen logboek niet';
  end if;
  raise notice 'ok: de persoon ziet zijn eigen logboek';
end
$$;

reset role;

do $$
begin
  raise notice '----------------------------------------';
  raise notice 'ALLE RLS-TESTS GESLAAGD';
  raise notice '----------------------------------------';
end
$$;

rollback;
