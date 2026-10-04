-- =====================================================================
--  LIFEANGLE Care — kamers en bezetting
--  Supabase migratie, versie 82
--
--  Draai dit na 81_spullen.sql.
--  Terugdraaien: supabase/rollback/82_kamers.sql
--  Tests: supabase/tests/test_82_kamers.sql
--
--  BESTAAND   een verblijf had een kamer als vrije tekst (stay.room, 52).
--             Welke kamers er zijn en welke vrij zijn, stond nergens.
--  VOORGESTELD kamer: de kamers van een afdeling, met het aantal bedden.
--             bezetting(org) geeft per open verblijf de afdeling (als id) en
--             de kamer, zodat het scherm "Kamers" kan tonen wat bezet en vrij
--             is. Een bewoner krijgt een kamer met het bestaande
--             zet_verblijf() (60); de koppeling blijft de kamernaam.
--  RISICO     laag. Nieuwe tabel en functie; stay verandert niet.
--
--  Wie mag wat
--  -----------
--    kamer       lezen: medewerkers van de organisatie (is_org_staff);
--                beheren: org admin en coördinator
--    bezetting   medewerkers van de organisatie: naam, afdeling, kamer en
--                sinds wanneer. Dat zagen ze al via org_bewoners (53); geen
--                andere gegevens.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.zet_verblijf(uuid, uuid, text)') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;

create table if not exists public.kamer (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisation (id) on delete cascade,
  department_id  uuid not null references public.department (id) on delete cascade,
  naam           text not null check (char_length(btrim(naam)) between 1 and 20),
  bedden         smallint not null default 1 check (bedden between 1 and 4),
  actief         boolean not null default true,
  notitie        text check (notitie is null or char_length(notitie) <= 200),
  created_at     timestamptz not null default now(),
  unique (department_id, naam)
);
create index if not exists kamer_org_idx on public.kamer (org_id);

comment on table public.kamer is
  'De kamers van een afdeling. Een bewoner hoort bij een kamer via stay.room = kamer.naam op dezelfde afdeling.';
comment on column public.kamer.notitie is
  'Over de kamer zelf (bv. "aangepaste badkamer"), nooit over een bewoner.';

alter table public.kamer enable row level security;

drop policy if exists kamer_read on public.kamer;
create policy kamer_read on public.kamer for select
  using (public.is_org_staff(org_id));

drop policy if exists kamer_write on public.kamer;
create policy kamer_write on public.kamer for all
  using (public.org_role_of(org_id) in ('org_admin', 'coordinator'))
  with check (public.org_role_of(org_id) in ('org_admin', 'coordinator'));

revoke all on public.kamer from anon;
grant select, insert, update, delete on public.kamer to authenticated;

-- De afdeling hoort bij dezelfde organisatie; org_id ligt vast.
create or replace function public.kamer_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.created_at := old.created_at;
  end if;
  new.naam := btrim(new.naam);
  if not exists (select 1 from public.department where id = new.department_id and org_id = new.org_id) then
    raise exception 'Die afdeling hoort niet bij deze organisatie' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.kamer_check() from public, anon, authenticated;

drop trigger if exists kamer_check on public.kamer;
create trigger kamer_check before insert or update on public.kamer
  for each row execute function public.kamer_check();

-- Wie woont waar: per open verblijf.
create or replace function public.bezetting(org uuid)
returns table (
  household_id  uuid,
  naam          text,
  department_id uuid,
  kamer         text,
  sinds         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.household_id, h.person_name, s.department_id, s.room, s.started_at
    from public.stay s
    join public.household h on h.id = s.household_id
   where s.org_id = org
     and s.ended_at is null
     and public.is_org_staff(org)
   order by h.person_name;
$$;

revoke execute on function public.bezetting(uuid) from public, anon;
grant execute on function public.bezetting(uuid) to authenticated, service_role;
