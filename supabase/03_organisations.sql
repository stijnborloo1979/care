-- =====================================================================
--  THUIS — organisatielaag
--  Supabase migratie, versie 3
--
--  Draai dit NA 01_schema.sql. 02_demo_data.sql mag er al gedraaid zijn:
--  bestaande huishoudens houden org_id = null en blijven werken zoals
--  voorheen.
--
--  Wat dit toevoegt:
--    - organisation + org_membership: medewerkers van een zorgorganisatie
--    - household.org_id: null = gezin dat zelf betaalt, ingevuld = klant
--      van een organisatie
--    - een aangepaste is_member() en auth_role(), zodat bestaande
--      policies vanzelf meeschalen zonder dat je er één moet herschrijven
--
--  Het uitgangspunt: familie blijft de baas over haar eigen huishouden.
--  Niemand van een organisatie krijgt ooit automatisch de rol 'admin'.
--  Een verpleegkundige die echt bij een cliënt hoort, krijgt een gewone
--  membership-rij — expliciet, zichtbaar en intrekbaar.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Rollen binnen een organisatie
-- ---------------------------------------------------------------------

do $$
begin
  create type public.org_role as enum ('org_admin', 'coordinator', 'caregiver');
exception
  when duplicate_object then null;
end
$$;

comment on type public.org_role is
  'org_admin beheert de organisatie, coordinator volgt alle cliënten op, caregiver alleen de toegewezen cliënten.';


-- ---------------------------------------------------------------------
--  2. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.organisation (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  vat_number    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.org_membership (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisation (id) on delete cascade,
  profile_id  uuid not null references public.profile (id) on delete cascade,
  role        public.org_role not null default 'caregiver',
  job_title   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, profile_id)
);

alter table public.household
  add column if not exists org_id uuid references public.organisation (id) on delete set null;

-- De koppeling aan een organisatie is een beslissing van de familie, geen
-- administratief feit. Leg vast wanneer en door wie ze gemaakt is.
alter table public.household
  add column if not exists org_linked_at timestamptz;
alter table public.household
  add column if not exists org_linked_by uuid references public.profile (id) on delete set null;

create index if not exists household_org_idx      on public.household (org_id);
create index if not exists org_membership_pid_idx on public.org_membership (profile_id);


-- ---------------------------------------------------------------------
--  3. Rechtenfuncties
--
--  family_role() is de oude auth_role(): alleen wat in membership staat.
--  auth_role() krijgt er een organisatie-tak bij. Elke bestaande policy
--  blijft ongewijzigd en werkt meteen mee.
-- ---------------------------------------------------------------------

create or replace function public.org_role_of(o uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.org_membership
  where org_id = o and profile_id = auth.uid() and active;
$$;

-- Alleen wat de familie zelf heeft toegekend. Gebruik dit waar de
-- organisatie niets te zoeken heeft, zoals bij documenten.
create or replace function public.family_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.membership
  where household_id = hh and profile_id = auth.uid();
$$;

-- Ziet deze medewerker het huishouden via de organisatie?
-- Alleen org_admin en coordinator: een caregiver heeft een expliciete
-- toewijzing nodig, en die is gewoon een membership-rij.
create or replace function public.org_oversees(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household h
    join public.org_membership om on om.org_id = h.org_id
    where h.id = hh
      and h.org_id is not null
      and om.profile_id = auth.uid()
      and om.active
      and om.role in ('org_admin', 'coordinator')
  );
$$;

create or replace function public.is_member(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membership
    where household_id = hh and profile_id = auth.uid()
  ) or public.org_oversees(hh);
$$;

-- Een medewerker van een organisatie krijgt hoogstens 'member'.
-- 'admin' blijft voorbehouden aan de familie: alleen zij voegt leden toe,
-- wijzigt rollen en beheert documenten.
create or replace function public.auth_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.family_role(hh),
    case when public.org_oversees(hh) then 'member'::public.member_role else null end
  );
$$;

create or replace function public.is_org_staff(o uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_membership
    where org_id = o and profile_id = auth.uid() and active
  );
$$;


-- ---------------------------------------------------------------------
--  4. Documenten blijven van de familie
--
--  De policies uit 01 gebruikten auth_role(). Die zou nu ook een
--  coördinator binnenlaten. Voor documenten is dat niet de bedoeling:
--  identiteitskaarten en verzekeringspapieren zijn geen zorgdossier.
-- ---------------------------------------------------------------------

drop policy if exists document_read on public.document;
create policy document_read on public.document for select
  using (public.family_role(household_id) in ('admin', 'member'));

drop policy if exists document_write on public.document;
create policy document_write on public.document for all
  using (public.family_role(household_id) = 'admin')
  with check (public.family_role(household_id) = 'admin');

-- Hetzelfde voor de audit log: dat is een familiezaak.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using (public.family_role(household_id) = 'admin');


-- ---------------------------------------------------------------------
--  5. RLS op de nieuwe tabellen
-- ---------------------------------------------------------------------

alter table public.organisation    enable row level security;
alter table public.org_membership  enable row level security;

drop policy if exists organisation_read on public.organisation;
create policy organisation_read on public.organisation for select
  using (public.is_org_staff(id));

drop policy if exists organisation_write on public.organisation;
create policy organisation_write on public.organisation for update
  using (public.org_role_of(id) = 'org_admin')
  with check (public.org_role_of(id) = 'org_admin');

drop policy if exists org_membership_read on public.org_membership;
create policy org_membership_read on public.org_membership for select
  using (public.is_org_staff(org_id) or profile_id = auth.uid());

drop policy if exists org_membership_admin on public.org_membership;
create policy org_membership_admin on public.org_membership for all
  using (public.org_role_of(org_id) = 'org_admin')
  with check (public.org_role_of(org_id) = 'org_admin');


-- ---------------------------------------------------------------------
--  6. Koppelen en toewijzen
-- ---------------------------------------------------------------------

create or replace function public.create_organisation(org_name text, contact text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  insert into public.organisation (name, contact_email)
  values (org_name, contact)
  returning id into o;

  insert into public.org_membership (org_id, profile_id, role, job_title)
  values (o, auth.uid(), 'org_admin', 'Beheerder');

  return o;
end;
$$;

-- Alleen de familiebeheerder koppelt haar huishouden aan een organisatie.
-- Nooit andersom: een organisatie kan zichzelf geen cliënt toe-eigenen.
create or replace function public.link_household_to_org(hh uuid, o uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan een huishouden koppelen';
  end if;

  if not exists (select 1 from public.organisation where id = o and active) then
    raise exception 'Onbekende organisatie';
  end if;

  update public.household
     set org_id = o,
         org_linked_at = now(),
         org_linked_by = auth.uid()
   where id = hh;

  insert into public.care_log (household_id, occurred_at, title, note, author_id, source)
  values (hh, now(), 'Gekoppeld aan een zorgorganisatie',
          (select name from public.organisation where id = o), auth.uid(), 'family');
end;
$$;

create or replace function public.unlink_household_from_org(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan de koppeling stoppen';
  end if;

  update public.household
     set org_id = null, org_linked_at = null, org_linked_by = null
   where id = hh;

  -- Toegang van medewerkers vervalt mee. Expliciet, niet stilzwijgend.
  delete from public.membership m
   where m.household_id = hh
     and m.role = 'caregiver'
     and exists (select 1 from public.org_membership om where om.profile_id = m.profile_id);

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Koppeling met de zorgorganisatie gestopt', auth.uid(), 'family');
end;
$$;

-- Een coördinator wijst een verpleegkundige toe aan een cliënt. Dat maakt
-- gewoon een membership-rij: dezelfde rechten, dezelfde zichtbaarheid en
-- even makkelijk in te trekken als bij een familielid.
create or replace function public.assign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
begin
  select org_id into o from public.household where id = hh;
  if o is null then
    raise exception 'Dit huishouden hoort niet bij een organisatie';
  end if;

  -- Let op: org_role_of() geeft null voor wie niet bij de organisatie
  -- hoort, en "null not in (...)" is null, niet true. Zonder coalesce
  -- wordt de uitzondering overgeslagen en valt het hek open.
  if coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen een beheerder of coördinator kan toewijzen';
  end if;

  if not exists (
    select 1 from public.org_membership
    where org_id = o and profile_id = caregiver and active
  ) then
    raise exception 'Die persoon werkt niet voor deze organisatie';
  end if;

  insert into public.membership (household_id, profile_id, role, invited_by)
  values (hh, caregiver, 'caregiver', auth.uid())
  on conflict (household_id, profile_id) do nothing;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Zorgverlener toegewezen', auth.uid(), 'caregiver');
end;
$$;

create or replace function public.unassign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
begin
  select org_id into o from public.household where id = hh;

  if public.family_role(hh) is distinct from 'admin'
     and (o is null or coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator')) then
    raise exception 'Geen recht om deze toewijzing te stoppen';
  end if;

  delete from public.membership
   where household_id = hh and profile_id = caregiver and role = 'caregiver';
end;
$$;

grant execute on function public.create_organisation(text, text)       to authenticated;
grant execute on function public.link_household_to_org(uuid, uuid)     to authenticated;
grant execute on function public.unlink_household_from_org(uuid)       to authenticated;
grant execute on function public.assign_caregiver(uuid, uuid)          to authenticated;
grant execute on function public.unassign_caregiver(uuid, uuid)        to authenticated;
grant execute on function public.family_role(uuid)                     to authenticated;
grant execute on function public.org_role_of(uuid)                     to authenticated;
grant execute on function public.is_org_staff(uuid)                    to authenticated;


-- ---------------------------------------------------------------------
--  7. Overzicht voor de organisatie
--
--  security_invoker = true: de view draait met de rechten van wie ze
--  opvraagt, dus RLS geldt gewoon. Een coördinator ziet haar cliënten,
--  een verpleegkundige alleen de toegewezen huishoudens.
-- ---------------------------------------------------------------------

create or replace view public.org_household_status
with (security_invoker = true) as
select
  h.id            as household_id,
  h.org_id,
  h.person_name,
  h.timezone,
  (select count(*)
     from public.medication_log ml
    where ml.household_id = h.id
      and ml.taken_at is null
      and ml.due_at < now()
      and (ml.due_at at time zone h.timezone)::date = (now() at time zone h.timezone)::date
  ) as meds_open,
  (select count(*)
     from public.agenda_event ae
    where ae.household_id = h.id
      and ae.done_at is null
      and ae.starts_at < now() - interval '1 hour'
      and (ae.starts_at at time zone h.timezone)::date = (now() at time zone h.timezone)::date
  ) as events_overdue,
  (select max(cl.occurred_at)
     from public.care_log cl
    where cl.household_id = h.id
  ) as last_activity
from public.household h
where h.org_id is not null;

grant select on public.org_household_status to authenticated;

comment on view public.org_household_status is
  'Eén rij per cliënt voor het organisatiedashboard. Toont afwijkingen, geen medische gegevens.';


-- =====================================================================
--  Terugdraaien, mocht je van gedachten veranderen:
--
--    drop view if exists public.org_household_status;
--    drop function if exists public.assign_caregiver(uuid, uuid);
--    ... (de overige functies uit deel 6)
--    alter table public.household drop column if exists org_id;
--    drop table if exists public.org_membership;
--    drop table if exists public.organisation;
--
--  Zet daarna is_member() en auth_role() terug naar de versie uit
--  01_schema.sql. Huishoudens van gezinnen merken van dit alles niets:
--  bij org_id = null gedraagt elke functie zich exact zoals voorheen.
-- =====================================================================
