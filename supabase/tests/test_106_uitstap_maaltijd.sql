-- =====================================================================
--  Test migratie 106: eet_mee op een uitstap.
--  Draai na 106_uitstap_maaltijd.sql. Alles wordt teruggedraaid.
-- =====================================================================
begin;

create temp table resultaat (nr serial, omschrijving text, verwacht int, werkelijk int, ok boolean);
grant select, insert on resultaat to public;
grant usage on sequence resultaat_nr_seq to public;

do $$
declare
  u_fam uuid := gen_random_uuid();
  u_vreemd uuid := gen_random_uuid();
  hh uuid;
  uit uuid;
  n int;
  eet boolean;
  geweigerd boolean;
begin
  insert into auth.users (id, email) values (u_fam, 'fam.106@test.be'), (u_vreemd, 'vreemd.106@test.be');
  insert into public.household (person_name) values ('Test 106') returning id into hh;
  insert into public.membership (household_id, profile_id, role) values (hh, u_fam, 'admin');

  -- 1. Nieuwe uitstap: standaard niet eten mee.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fam::text, 'role', 'authenticated')::text, true);
  insert into public.uitstap (household_id, met_wie, vertrek, terug)
    values (hh, 'Els', now() + interval '2 hours', now() + interval '5 hours')
    returning id into uit;
  select eet_mee into eet from public.uitstap where id = uit;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('standaard: niet eten mee', 0, case when eet then 1 else 0 end, eet = false);

  -- 2. Familie zet "blijft eten" aan vóór vertrek.
  perform public.uitstap_eetkeuze(uit, true);
  select eet_mee into eet from public.uitstap where id = uit;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('familie zet blijft eten aan', 1, case when eet then 1 else 0 end, eet = true);

  -- 3. Een vreemde kan het niet wijzigen.
  perform set_config('request.jwt.claims', json_build_object('sub', u_vreemd::text, 'role', 'authenticated')::text, true);
  geweigerd := false;
  begin
    perform public.uitstap_eetkeuze(uit, false);
  exception when insufficient_privilege then
    geweigerd := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('vreemde kan keuze niet wijzigen', 1, case when geweigerd then 1 else 0 end, geweigerd);

  -- 4. Na het vertrek ligt de keuze vast.
  reset role;
  update public.uitstap set vertrek = now() - interval '1 hour' where id = uit;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fam::text, 'role', 'authenticated')::text, true);
  geweigerd := false;
  begin
    perform public.uitstap_eetkeuze(uit, false);
  exception when others then
    geweigerd := true;
  end;
  insert into resultaat (omschrijving, verwacht, werkelijk, ok)
    values ('na vertrek is de keuze vast', 1, case when geweigerd then 1 else 0 end, geweigerd);
end
$$;

reset role;

select nr, omschrijving, verwacht, werkelijk, ok from resultaat order by nr;

do $$
begin
  if exists (select 1 from resultaat where not ok) then
    raise exception 'Een of meer controles faalden: zie de tabel hierboven';
  end if;
end
$$;

rollback;
