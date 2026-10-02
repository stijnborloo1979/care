-- =====================================================================
--  Systeemcontrole (VEREIST_MIGRATIE 76)
-- =====================================================================
begin;

create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

-- Na alle migraties ontbreekt niets
select pg_temp.gelijk('alles aanwezig na alle migraties',
  (select string_agg(migratie::text, ',') from public.systeem_controle() where not aanwezig), null::text);

-- Een ontbrekende kolom wordt gezien
alter table public.agenda_event drop column claimed_by cascade;
select pg_temp.gelijk('ontbrekende 44 wordt gezien',
  (select string_agg(migratie::text, ',') from public.systeem_controle() where not aanwezig), '44'::text);

-- Ingelogd mag kijken, anoniem niet
do $$
begin
  set local role anon;
  begin
    perform public.systeem_controle();
    raise exception 'GEZAKT: anon mocht kijken';
  exception when insufficient_privilege then
    raise notice 'ok: anon mag niet kijken';
  end;
  reset role;
end $$;

rollback;
