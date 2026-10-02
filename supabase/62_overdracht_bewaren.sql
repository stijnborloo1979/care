-- =====================================================================
--  LIFEANGLE Care — bewaartermijn van de overdracht per woonzorgcentrum
--  Supabase migratie, versie 62   (J11, tweede deel)
--
--  Draai dit na 61_bewaartermijn.sql.
--  Terugdraaien: supabase/rollback/62_overdracht_bewaren.sql
--  Tests: supabase/tests/test_62_overdracht_bewaren.sql
--
--  Bestaand (59)
--  -------------
--  Een overdracht bleef voor altijd bewaard.
--
--  Voorgesteld
--  -----------
--    - organisation.overdracht_bewaar_dagen, standaard 30, tussen 7 en 365.
--    - Een overdracht wordt gewist zodra haar dienstdatum ouder is dan die
--      termijn. De overdracht gaat over een dienst, niet over één bewoner:
--      wat blijvend belangrijk is, hoort in een zorgnotitie.
--    - zet_overdracht_termijn(org, dagen): alleen de beheerder.
--    - overdracht_opruimen() elke nacht om 03:25 (pg_cron, als dat aan staat).
--
--  Risico
--  ------
--  Bij de eerste nachtelijke opruiming verdwijnt elke overdracht ouder dan
--  30 dagen (of de gekozen termijn). Het scherm toont vooraf hoeveel.
-- =====================================================================

do $$
begin
  if to_regclass('public.handover') is null then
    raise exception 'Draai eerst 59_zorg.sql';
  end if;
end
$$;

alter table public.organisation
  add column if not exists overdracht_bewaar_dagen integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_overdracht_bewaar_check') then
    alter table public.organisation add constraint organisation_overdracht_bewaar_check
      check (overdracht_bewaar_dagen between 7 and 365);
  end if;
end
$$;

comment on column public.organisation.overdracht_bewaar_dagen is
  'Hoe lang een overdracht bewaard blijft, gerekend vanaf de dienstdatum. Per WZC (J11).';


create or replace function public.overdracht_termijn(org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select overdracht_bewaar_dagen from public.organisation
   where id = org and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

-- Hoeveel overdrachten zouden met deze termijn bij de volgende opruiming verdwijnen?
create or replace function public.overdracht_termijn_gevolg(org uuid, dagen integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.handover h
    join public.department d on d.id = h.department_id
   where d.org_id = org
     and h.shift_date < current_date - dagen
     and public.org_role_of(org) = 'org_admin';
$$;

create or replace function public.zet_overdracht_termijn(org uuid, dagen integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.org_role_of(org) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  if dagen is null or dagen < 7 or dagen > 365 then
    raise exception 'Kies een termijn tussen 7 en 365 dagen' using errcode = '22023';
  end if;
  update public.organisation set overdracht_bewaar_dagen = dagen where id = org;
  return public.overdracht_termijn_gevolg(org, dagen);
end;
$$;

-- Opruimen: per organisatie haar eigen termijn. Alleen voor de server.
create or replace function public.overdracht_opruimen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.handover h
   using public.department d, public.organisation o
   where d.id = h.department_id
     and o.id = d.org_id
     and h.shift_date < current_date - o.overdracht_bewaar_dagen;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.overdracht_opruimen() from public, anon, authenticated;
grant execute on function public.overdracht_opruimen() to service_role;

do $$
declare
  f text;
begin
  foreach f in array array['public.overdracht_termijn(uuid)', 'public.overdracht_termijn_gevolg(uuid, integer)',
                           'public.zet_overdracht_termijn(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;


do $$
begin
  perform cron.unschedule('overdracht-opruimen');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('overdracht-opruimen', '25 3 * * *', 'select public.overdracht_opruimen()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw.';
end
$$;
