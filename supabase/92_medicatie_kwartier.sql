-- =====================================================================
--  LIFEANGLE — medicatie-waarschuwing elk kwartier (migratie 92)
--
--  De waarschuwing "medicatie nog niet bevestigd" werd alleen gemaakt door
--  run_nightly(), dat om 02:30 draait. Die controleert alleen innames van
--  "vandaag", en op dat moment is dat de volgende dag. Overdag gebeurde
--  dus niets.
--
--  Deze migratie maakt een kleine controle die alleen medicatie bekijkt
--  en elk kwartier draait. Eén melding per inname: de sleutel bevat ook
--  het tijdstip, zodat twee innames van hetzelfde medicijn elk hun eigen
--  melding krijgen.
--
--  Draai dit na 91_bezoek_afzeggen.sql.
-- =====================================================================

create or replace function public.controleer_medicatie_overdag()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hh   record;
  med  record;
  vandaag date;
  n    integer := 0;
begin
  for hh in
    select id, timezone from public.household where timezone is not null
  loop
    vandaag := (now() at time zone hh.timezone)::date;

    -- innames van vandaag die meer dan een uur geleden hadden gemoeten
    for med in
      select m.name, ml.due_at
      from public.medication_log ml
      join public.medication m on m.id = ml.medication_id
      where ml.household_id = hh.id
        and ml.taken_at is null
        and ml.due_at < now() - interval '1 hour'
        and (ml.due_at at time zone hh.timezone)::date = vandaag
    loop
      insert into public.notification (household_id, level, body, target_role, dedupe_key)
      values (hh.id, 'warn',
              med.name || ' van ' || to_char(med.due_at at time zone hh.timezone, 'HH24:MI') ||
              ' is nog niet bevestigd.',
              null,
              'medov:' || vandaag || ':' || med.name || ':' || to_char(med.due_at, 'YYYYMMDDHH24MI'))
      on conflict do nothing;
      n := n + 1;
    end loop;
  end loop;

  return n;
end;
$$;

revoke execute on function public.controleer_medicatie_overdag() from public, anon, authenticated;

-- Inplannen: elk kwartier. Staat pg_cron niet aan, dan krijg je een melding
-- en is de migratie toch geslaagd; zet de extensie dan aan en draai dit
-- blok opnieuw.
do $$
begin
  perform cron.unschedule('medicatie-kwartier');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('medicatie-kwartier', '*/15 * * * *',
    'select public.controleer_medicatie_overdag()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw.';
end
$$;
