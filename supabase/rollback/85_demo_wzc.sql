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
drop function if exists public.wis_demo_wzc(uuid);
drop function if exists public.demo_rol(uuid, text);
drop function if exists public.maak_demo_wzc();
drop trigger if exists organisation_demo_vast on public.organisation;
drop trigger if exists household_demo_vast on public.household;
drop function if exists public.demo_vast();
alter table public.household drop column if exists demo;
alter table public.organisation drop column if exists demo;
