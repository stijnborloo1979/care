-- =====================================================================
--  LIFEANGLE Care — bewaartermijn van zorgnotities per woonzorgcentrum
--  Supabase migratie, versie 61   (beslissing J11: per WZC instelbaar)
--
--  Draai dit na 60_personeel.sql.
--  Terugdraaien: supabase/rollback/61_bewaartermijn.sql
--  Tests: supabase/tests/test_61_bewaartermijn.sql
--
--  Bestaand (59)
--  -------------
--  Bij het einde van een verblijf krijgen de zorgnotities een bewaartermijn
--  van 2 jaar. care_note_opruimen() wist wat erover is, maar stond nog niet
--  ingepland.
--
--  Voorgesteld
--  -----------
--    - organisation.bewaartermijn_maanden, standaard 24, tussen 6 en 120.
--    - Bij het einde van een verblijf geldt de termijn van dat WZC.
--    - zet_bewaartermijn(org, maanden): alleen de beheerder. Een nieuwe
--      termijn geldt ook voor notities van bewoners die al vertrokken zijn
--      (vanaf hun vertrek), want dat is wat "de termijn van dit WZC"
--      betekent. Notities van bewoners die er nog wonen, krijgen pas een
--      termijn bij hun vertrek.
--    - care_note_opruimen() elke nacht om 03:20 (pg_cron, als dat aan staat).
--
--  Risico
--  ------
--  Een kortere termijn kan bij de volgende nachtelijke opruiming meteen
--  notities wissen van bewoners die lang geleden vertrokken. Het scherm
--  waarschuwt daarvoor, en zet_bewaartermijn geeft terug hoeveel notities
--  binnen de week gewist worden.
-- =====================================================================

do $$
begin
  if to_regclass('public.care_note') is null then
    raise exception 'Draai eerst 59_zorg.sql';
  end if;
end
$$;

alter table public.organisation
  add column if not exists bewaartermijn_maanden integer not null default 24;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_bewaartermijn_check') then
    alter table public.organisation add constraint organisation_bewaartermijn_check
      check (bewaartermijn_maanden between 6 and 120);
  end if;
end
$$;

comment on column public.organisation.bewaartermijn_maanden is
  'Hoe lang zorgnotities bewaard blijven na het einde van een verblijf. Per WZC (J11).';


-- Bij het einde van een verblijf: de termijn van dat WZC (vervangt 59).
create or replace function public.care_note_bewaartermijn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  maanden integer;
begin
  if new.ended_at is not null and old.ended_at is null then
    select coalesce(bewaartermijn_maanden, 24) into maanden from public.organisation where id = new.org_id;
    update public.care_note
       set retention_until = new.ended_at + make_interval(months => coalesce(maanden, 24))
     where stay_id = new.id and retention_until is null;
  end if;
  return new;
end;
$$;


-- De termijn lezen (beheerder en coördinator) en zetten (beheerder).
create or replace function public.bewaartermijn(org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select bewaartermijn_maanden from public.organisation
   where id = org and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

create or replace function public.zet_bewaartermijn(org uuid, maanden integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  binnenkort integer;
begin
  if public.org_role_of(org) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  if maanden is null or maanden < 6 or maanden > 120 then
    raise exception 'Kies een termijn tussen 6 en 120 maanden' using errcode = '22023';
  end if;

  update public.organisation set bewaartermijn_maanden = maanden where id = org;

  -- Ook voor wie al vertrokken is: vanaf het einde van dat verblijf.
  update public.care_note n
     set retention_until = s.ended_at + make_interval(months => maanden)
    from public.stay s
   where s.id = n.stay_id and n.org_id = org and s.ended_at is not null;

  select count(*) into binnenkort from public.care_note
   where org_id = org and retention_until is not null and retention_until < now() + interval '7 days';
  return binnenkort;
end;
$$;

-- Hoeveel notities zouden met deze termijn binnen de week gewist worden?
create or replace function public.bewaartermijn_gevolg(org uuid, maanden integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.care_note n
    join public.stay s on s.id = n.stay_id
   where n.org_id = org and s.ended_at is not null
     and s.ended_at + make_interval(months => maanden) < now() + interval '7 days'
     and public.org_role_of(org) = 'org_admin';
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.bewaartermijn(uuid)', 'public.zet_bewaartermijn(uuid, integer)',
                           'public.bewaartermijn_gevolg(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;


-- Elke nacht opruimen, na de nachtjob.
do $$
begin
  perform cron.unschedule('zorgnotities-opruimen');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('zorgnotities-opruimen', '20 3 * * *', 'select public.care_note_opruimen()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw.';
end
$$;
