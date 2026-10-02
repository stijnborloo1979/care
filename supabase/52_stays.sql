-- =====================================================================
--  LIFEANGLE — verblijven, afdelingen en toewijzingen
--  Supabase migratie, versie 52
--
--  Draai dit na 51_policies_groep2.sql.
--  Terugdraaien: supabase/rollback/52_stays.sql
--  Tests: supabase/tests/test_52_stays.sql
--
--  Waarom
--  ------
--  Voor LifeAngle Care moet vastliggen WAAR iemand verblijft (welk WZC,
--  welke afdeling, welke kamer, van wanneer tot wanneer) en WIE van het
--  team voor haar zorgt. Vandaag is er alleen household.org_id: één
--  waarde, zonder geschiedenis en zonder afdeling.
--
--  Nieuwe tabellen
--  ---------------
--    department        afdelingen en teams van een organisatie
--    department_staff  wie op welke afdeling werkt (team_lead of staff)
--    stay              een verblijf: bewoner × organisatie, met begin en einde
--    care_assignment   welke medewerker welke bewoner volgt, tijdens één verblijf
--
--  Wat er NIET verandert
--  ---------------------
--  Geen enkele toegangsregel leest deze tabellen al. household.org_id
--  blijft voorlopig de bron: link_household_to_org() en
--  unlink_household_from_org() werken zoals voorheen, en een trigger houdt
--  stay gelijk met org_id (openen, sluiten, wisselen). Pas in een latere
--  migratie wordt stay de bron en org_id een afgeleide.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.department (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisation (id) on delete cascade,
  parent_id   uuid references public.department (id) on delete set null,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_at  timestamptz not null default now()
);
create index if not exists department_org_idx on public.department (org_id);

create table if not exists public.department_staff (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.department (id) on delete cascade,
  profile_id     uuid not null references public.profile (id) on delete cascade,
  role           text not null default 'staff' check (role in ('team_lead', 'staff')),
  valid_from     timestamptz not null default now(),
  valid_until    timestamptz,
  created_at     timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
create index if not exists department_staff_profile_idx on public.department_staff (profile_id, valid_until);
create index if not exists department_staff_dept_idx on public.department_staff (department_id);

create table if not exists public.stay (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  org_id         uuid not null references public.organisation (id) on delete cascade,
  department_id  uuid references public.department (id) on delete set null,
  room           text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  admitted_by    uuid references public.profile (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
-- Hoogstens één open verblijf per bewoner.
create unique index if not exists stay_een_open_idx on public.stay (household_id) where ended_at is null;
create index if not exists stay_org_idx on public.stay (org_id) where ended_at is null;

create table if not exists public.care_assignment (
  id           uuid primary key default gen_random_uuid(),
  stay_id      uuid not null references public.stay (id) on delete cascade,
  profile_id   uuid not null references public.profile (id) on delete cascade,
  valid_from   timestamptz not null default now(),
  valid_until  timestamptz,
  reason       text,
  created_by   uuid references public.profile (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
create index if not exists care_assignment_profile_idx on public.care_assignment (profile_id, valid_until);
create index if not exists care_assignment_stay_idx on public.care_assignment (stay_id);


-- ---------------------------------------------------------------------
--  2. Wie mag wat zien
--
--  Voorlopig eenvoudig en streng: de organisatie ziet haar eigen
--  afdelingen, medewerkers en verblijven; de familiebeheerder en de
--  bewoner zien het verblijf van hun huishouden. Schrijven kan alleen de
--  org admin (afdelingen, medewerkers, toewijzingen). Verblijven worden
--  alleen door de trigger hieronder gezet.
-- ---------------------------------------------------------------------

alter table public.department       enable row level security;
alter table public.department_staff enable row level security;
alter table public.stay             enable row level security;
alter table public.care_assignment  enable row level security;

drop policy if exists department_read on public.department;
create policy department_read on public.department for select
  using (public.is_org_staff(org_id));
drop policy if exists department_write on public.department;
create policy department_write on public.department for all
  using (public.org_role_of(org_id) = 'org_admin')
  with check (public.org_role_of(org_id) = 'org_admin');

drop policy if exists department_staff_read on public.department_staff;
create policy department_staff_read on public.department_staff for select
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.department d
                where d.id = department_id and public.is_org_staff(d.org_id))
  );
drop policy if exists department_staff_write on public.department_staff;
create policy department_staff_write on public.department_staff for all
  using (exists (select 1 from public.department d
                  where d.id = department_id and public.org_role_of(d.org_id) = 'org_admin'))
  with check (exists (select 1 from public.department d
                       where d.id = department_id and public.org_role_of(d.org_id) = 'org_admin'));

drop policy if exists stay_read on public.stay;
create policy stay_read on public.stay for select
  using (
    public.is_org_staff(org_id)
    or public.is_self(household_id)
    or public.family_role(household_id) = 'admin'
  );

drop policy if exists care_assignment_read on public.care_assignment;
create policy care_assignment_read on public.care_assignment for select
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.stay s
                where s.id = stay_id
                  and (public.is_org_staff(s.org_id)
                       or public.is_self(s.household_id)
                       or public.family_role(s.household_id) = 'admin'))
  );
drop policy if exists care_assignment_write on public.care_assignment;
create policy care_assignment_write on public.care_assignment for all
  using (exists (select 1 from public.stay s
                  where s.id = stay_id and public.org_role_of(s.org_id) = 'org_admin'))
  with check (exists (select 1 from public.stay s
                       where s.id = stay_id and s.ended_at is null
                         and public.org_role_of(s.org_id) = 'org_admin'));

revoke all on public.department, public.department_staff, public.stay, public.care_assignment from anon;


-- ---------------------------------------------------------------------
--  3. Verblijf volgt household.org_id
-- ---------------------------------------------------------------------

create or replace function public.stay_volgt_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  -- Het open verblijf bij een andere (of geen) organisatie sluiten.
  update public.stay
     set ended_at = now()
   where household_id = new.id
     and ended_at is null
     and org_id is distinct from new.org_id;

  -- Een nieuw verblijf openen als er een organisatie is en nog geen open verblijf.
  if new.org_id is not null and not exists (
       select 1 from public.stay where household_id = new.id and ended_at is null) then
    insert into public.stay (household_id, org_id, started_at, admitted_by)
    values (new.id, new.org_id, coalesce(new.org_linked_at, now()), new.org_linked_by);
  end if;
  return new;
end;
$$;

revoke execute on function public.stay_volgt_org() from public, anon, authenticated;

drop trigger if exists household_stay_sync on public.household;
create trigger household_stay_sync
  after insert or update of org_id on public.household
  for each row execute function public.stay_volgt_org();

-- Een verblijf dat eindigt, neemt zijn toewijzingen mee.
create or replace function public.stay_einde_toewijzingen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    update public.care_assignment
       set valid_until = greatest(valid_from, new.ended_at)
     where stay_id = new.id
       and (valid_until is null or valid_until > new.ended_at);
  end if;
  return new;
end;
$$;

revoke execute on function public.stay_einde_toewijzingen() from public, anon, authenticated;

drop trigger if exists stay_einde on public.stay;
create trigger stay_einde
  after update of ended_at on public.stay
  for each row execute function public.stay_einde_toewijzingen();

-- Bestaande koppelingen krijgen hun open verblijf.
insert into public.stay (household_id, org_id, started_at, admitted_by)
select h.id, h.org_id, coalesce(h.org_linked_at, now()), h.org_linked_by
  from public.household h
 where h.org_id is not null
   and not exists (select 1 from public.stay s where s.household_id = h.id and s.ended_at is null);
