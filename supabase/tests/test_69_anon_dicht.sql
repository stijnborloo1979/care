-- =====================================================================
--  Geen hulpfuncties voor wie niet ingelogd is (VEREIST_MIGRATIE 69)
-- =====================================================================
begin;

create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

-- Geen enkele security definer functie in public geeft anon nog iets terug
-- buiten de bewuste uitzonderingen (inloggen met een koppelcode, een
-- uitnodiging bekijken) — hier: de negen uit 69 zijn dicht.
select pg_temp.gelijk(format('anon mag %s niet uitvoeren', f),
  has_function_privilege('anon', f::regprocedure, 'execute'), false)
  from unnest(array[
    'public.huis_van(uuid)', 'public.support_level_of(uuid)', 'public.deelt_huis(uuid)',
    'public.is_member(uuid)', 'public.is_org_staff(uuid)', 'public.is_self(uuid)',
    'public.mag_huis_bewerken(uuid)', 'public.medication_summary(uuid, date, date)',
    'public.shares_household(uuid)']) f;

select pg_temp.gelijk(format('ingelogd mag %s nog', f),
  has_function_privilege('authenticated', f::regprocedure, 'execute'), true)
  from unnest(array['public.huis_van(uuid)', 'public.support_level_of(uuid)', 'public.is_member(uuid)']) f;

-- In de praktijk: een anonieme aanroep wordt geweigerd
do $$
declare hh uuid;
begin
  select id into hh from public.household limit 1;
  set local role anon;
  begin
    perform public.support_level_of(hh);
    raise exception 'GEZAKT: anon las het ondersteuningsniveau';
  exception when insufficient_privilege then
    raise notice 'ok: anon krijgt geen ondersteuningsniveau';
  end;
  reset role;
end $$;

-- Een gewone gebruiker merkt niets: zijn eigen gegevens blijven zichtbaar
do $$
declare u uuid; hh uuid; n int;
begin
  insert into auth.users (email) values ('a69@t') returning id into u;
  insert into public.household (person_name) values ('Test69') returning id into hh;
  insert into public.membership (household_id, profile_id, role) values (hh, u, 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.household where id = hh;
  if n <> 1 then raise exception 'GEZAKT: familie ziet haar huishouden niet meer'; end if;
  raise notice 'ok: familie ziet haar huishouden';
  reset role;
end $$;

rollback;
