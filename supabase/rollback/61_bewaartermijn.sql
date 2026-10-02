-- Terugdraaien van 61_bewaartermijn.sql: terug naar 2 jaar voor elk WZC
-- (zoals in 59). Bestaande termijnen blijven staan zoals ze nu zijn.

do $$
begin
  perform cron.unschedule('zorgnotities-opruimen');
exception when others then
  null;
end
$$;

drop function if exists public.bewaartermijn_gevolg(uuid, integer);
drop function if exists public.zet_bewaartermijn(uuid, integer);
drop function if exists public.bewaartermijn(uuid);

-- care_note_bewaartermijn zoals in 59
create or replace function public.care_note_bewaartermijn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    update public.care_note
       set retention_until = new.ended_at + interval '2 years'
     where stay_id = new.id and retention_until is null;
  end if;
  return new;
end;
$$;

alter table public.organisation drop constraint if exists organisation_bewaartermijn_check;
alter table public.organisation drop column if exists bewaartermijn_maanden;
