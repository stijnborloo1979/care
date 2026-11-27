-- =====================================================================
--  Dringende meldingen porren push-notify aan (VEREIST_MIGRATIE 111)
--  Zonder vault of pg_net mag een melding bewaren nooit mislukken.
-- =====================================================================
begin;

create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

do $$
declare hh uuid;
begin
  insert into public.household (person_name) values ('Porr') returning id into hh;
  insert into public.notification (household_id, level, body) values (hh, 'alert', 'hulp');
  insert into public.notification (household_id, level, body) values (hh, 'info', 'gewoon');
  perform pg_temp.gelijk('meldingen bewaard zonder vault',
    (select count(*) from public.notification where household_id = hh), 2::bigint);
end $$;

select pg_temp.gelijk('trigger bestaat',
  (select count(*) from pg_trigger where tgname = 'notification_porr_push'), 1::bigint);

-- Niet aanroepbaar door gebruikers
set local role authenticated;
do $$
begin
  begin
    perform public.porr_push_nu();
    raise exception 'GEZAKT: gebruiker kon porr_push_nu aanroepen';
  exception when insufficient_privilege then
    raise notice 'ok: gebruiker kan porr_push_nu niet aanroepen';
  end;
end $$;

rollback;
