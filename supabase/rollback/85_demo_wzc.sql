-- Terugdraaien van 85_demo_wzc.sql
-- Weigert zolang er een demo bestaat: wis die eerst (wis_demo_wzc) of bewust.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organisation' and column_name = 'demo')
     and exists (select 1 from public.organisation where demo) then
    raise exception 'Er bestaat nog een demo-woonzorgcentrum. Wis het eerst.';
  end if;
end
$$;
-- koppel_met_wzc terug zoals in 65 (zonder de demo-filter)
create or replace function public.koppel_met_wzc(hh uuid, code text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.organisation;
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan een huishouden koppelen' using errcode = '42501';
  end if;
  delete from public.koppel_poging where at < now() - interval '1 day';
  if (select count(*) from public.koppel_poging
       where profile_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Te veel pogingen. Probeer het over een uur opnieuw.' using errcode = '42501';
  end if;
  select * into o from public.organisation
   where koppelcode = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) and active;
  if o.id is null then
    insert into public.koppel_poging (profile_id) values (auth.uid());
    return null;
  end if;
  perform public.link_household_to_org(hh, o.id);
  return o.name;
end;
$$;
drop trigger if exists household_demo_volgt on public.household;
drop function if exists public.demo_volgt_org();
drop table if exists public.demo_poging;
drop function if exists public.wis_demo_wzc(uuid);
drop function if exists public.demo_rol(uuid, text);
drop function if exists public.maak_demo_wzc();
drop trigger if exists organisation_demo_vast on public.organisation;
drop trigger if exists household_demo_vast on public.household;
drop function if exists public.demo_vast();
alter table public.household drop column if exists demo;
alter table public.organisation drop column if exists demo_owner;
alter table public.organisation drop column if exists demo;
