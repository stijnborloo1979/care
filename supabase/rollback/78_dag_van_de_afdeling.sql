-- Terugdraaien van 78_dag_van_de_afdeling.sql
-- Weigert zodra er een vaste dag is ingevuld: dat is werk van het WZC.
do $$
begin
  if to_regclass('public.afdeling_dag') is not null and exists (select 1 from public.afdeling_dag) then
    raise exception 'Er staat een vaste dag in afdeling_dag. Bewaar of wis die eerst bewust.';
  end if;
end
$$;
drop function if exists public.dag_van_bewoner(uuid, date);
drop trigger if exists deelname_status_check on public.activity_participant;
drop function if exists public.deelname_status_check();
drop trigger if exists activity_afdeling_check on public.activity;
drop function if exists public.activity_afdeling_check();
drop table if exists public.afdeling_dag;
drop function if exists public.afdeling_dag_check();
drop function if exists public.mag_afdeling_plannen(uuid, uuid);
