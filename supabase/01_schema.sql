-- =====================================================================
--  THUIS — schema, rechten en opslag
--  Supabase migratie, versie 1
--
--  Gebruik: Supabase Dashboard → SQL Editor → New query → plakken → Run.
--  Draai dit op een leeg project. Alles is idempotent: opnieuw draaien
--  mag, maar overschrijft geen data.
--
--  Eén verfijning t.o.v. het architectuurdocument: mensen die Maria ziet
--  (`person_card`) staan los van mensen die kunnen inloggen (`membership`).
--  De huisarts en de buurvrouw hebben geen account, maar horen wel in
--  "Wie is wie?". Een person_card mag naar een profiel wijzen, maar hoeft
--  dat niet.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Extensies en enums
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.member_role as enum ('person', 'admin', 'member', 'caregiver');
exception
  when duplicate_object then null;
end
$$;


-- ---------------------------------------------------------------------
--  2. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.household (
  id            uuid primary key default gen_random_uuid(),
  person_name   text not null,
  address       text,
  timezone      text not null default 'Europe/Brussels',
  created_at    timestamptz not null default now()
);

comment on table public.household is 'Eén huishouden = één persoon met geheugenproblemen plus de mensen eromheen.';

create table if not exists public.profile (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  avatar_path   text,
  phone         text,
  preferences   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on column public.profile.preferences is 'Toegankelijkheid: tekstschaal, contrast, thema, eenvoudige modus, spraak.';

create table if not exists public.membership (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  profile_id    uuid not null references public.profile (id) on delete cascade,
  role          public.member_role not null default 'member',
  invited_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (household_id, profile_id)
);

create table if not exists public.person_card (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  profile_id    uuid references public.profile (id) on delete set null,
  name          text not null,
  relation      text not null,
  description   text,
  detail        text,
  phone         text,
  emoji         text,
  color         text,
  photo_path    text,
  kind          text not null default 'family'
                  check (kind in ('self', 'family', 'contact', 'care')),
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);

comment on column public.person_card.description is 'In gewone taal, gericht aan de persoon: "Els is je dochter."';

create table if not exists public.routine (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  name          text not null,
  emoji         text,
  rrule         text not null default 'FREQ=DAILY',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on column public.routine.rrule is 'RFC 5545, zonder DTSTART. Dagelijks, weekdagen, wekelijks en maandelijks delen zo één kolom.';

create table if not exists public.routine_step (
  id            uuid primary key default gen_random_uuid(),
  routine_id    uuid not null references public.routine (id) on delete cascade,
  household_id  uuid not null references public.household (id) on delete cascade,
  at_time       time not null,
  title         text not null,
  emoji         text,
  sort          integer not null default 0
);

create table if not exists public.agenda_event (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  starts_at     timestamptz not null,
  title         text not null,
  emoji         text,
  kind          text not null default 'routine'
                  check (kind in ('meal', 'med', 'visit', 'appt', 'routine', 'other')),
  note          text,
  person_id     uuid references public.person_card (id) on delete set null,
  routine_id    uuid references public.routine (id) on delete set null,
  done_at       timestamptz,
  done_by       uuid references public.profile (id) on delete set null,
  created_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.agenda_event.note is 'De zin die Maria op haar scherm leest: "Neem rustig de tijd."';

create table if not exists public.room (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  name          text not null,
  emoji         text,
  sort          integer not null default 0
);

create table if not exists public.item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  room_id       uuid not null references public.room (id) on delete cascade,
  name          text not null,
  emoji         text,
  where_text    text,
  photo_path    text,
  sort          integer not null default 0,
  updated_by    uuid references public.profile (id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.item_step (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.item (id) on delete cascade,
  household_id  uuid not null references public.household (id) on delete cascade,
  sort          integer not null default 0,
  body          text not null,
  photo_path    text
);

create table if not exists public.memory_note (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  category      text not null
                  check (category in ('personen', 'plaatsen', 'dingen', 'voorkeuren', 'routines', 'verhalen')),
  title         text not null,
  body          text not null,
  tags          text[] not null default '{}',
  created_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.memory_photo (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  year          integer,
  taken_on      date,
  title         text not null,
  story         text,
  photo_path    text,
  created_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.medication (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  name          text not null,
  dose          text,
  at_time       time not null,
  instruction   text,
  photo_path    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.medication_log (
  id             uuid primary key default gen_random_uuid(),
  medication_id  uuid not null references public.medication (id) on delete cascade,
  household_id   uuid not null references public.household (id) on delete cascade,
  due_at         timestamptz not null,
  taken_at       timestamptz,
  confirmed_by   uuid references public.profile (id) on delete set null,
  unique (medication_id, due_at)
);

comment on table public.medication_log is 'Eén rij per moment, niet per medicijn. Houdt de historie leesbaar.';

create table if not exists public.care_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  title         text not null,
  note          text,
  author_id     uuid references public.profile (id) on delete set null,
  source        text not null default 'family'
                  check (source in ('family', 'caregiver', 'person', 'system')),
  created_at    timestamptz not null default now()
);

create table if not exists public.document (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  category      text not null
                  check (category in ('identiteit', 'verzekering', 'medisch', 'afspraken', 'belangrijk')),
  name          text not null,
  storage_path  text,
  uploaded_by   uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.notification (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  level         text not null default 'info'
                  check (level in ('info', 'ok', 'warn', 'alert')),
  body          text not null,
  target_role   public.member_role,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create table if not exists public.location_setting (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null unique references public.household (id) on delete cascade,
  enabled       boolean not null default false,
  consent_at    timestamptz,
  consent_by    uuid references public.profile (id) on delete set null,
  home_lat      double precision,
  home_lng      double precision,
  radius_m      integer not null default 500
);

comment on table public.location_setting is 'Staat uit tot iemand expliciet toestemt. De toestemming zelf is een kolom.';

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  household_id  uuid,
  actor_id      uuid,
  table_name    text not null,
  row_id        uuid,
  action        text not null,
  at            timestamptz not null default now()
);


-- ---------------------------------------------------------------------
--  3. Indexen
-- ---------------------------------------------------------------------

create index if not exists agenda_event_hh_start_idx on public.agenda_event (household_id, starts_at);
create index if not exists care_log_hh_time_idx      on public.care_log (household_id, occurred_at desc);
create index if not exists medication_log_due_idx    on public.medication_log (medication_id, due_at desc);
create index if not exists medication_log_hh_idx     on public.medication_log (household_id, due_at desc);
create index if not exists item_room_idx             on public.item (room_id);
create index if not exists item_step_item_idx        on public.item_step (item_id, sort);
create index if not exists membership_profile_idx    on public.membership (profile_id);
create index if not exists person_card_hh_idx        on public.person_card (household_id, sort);
create index if not exists memory_note_hh_cat_idx    on public.memory_note (household_id, category);
create index if not exists document_hh_cat_idx       on public.document (household_id, category);
create index if not exists notification_hh_idx       on public.notification (household_id, created_at desc);


-- ---------------------------------------------------------------------
--  4. Helperfuncties
--
--  security definer is hier noodzakelijk: zonder dat leest de policy op
--  membership zichzelf en krijg je oneindige recursie.
-- ---------------------------------------------------------------------

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
  );
$$;

create or replace function public.auth_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.membership
  where household_id = hh and profile_id = auth.uid();
$$;

create or replace function public.shares_household(other_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.household_id = mine.household_id
    where mine.profile_id = auth.uid() and theirs.profile_id = other_profile
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists agenda_event_updated on public.agenda_event;
create trigger agenda_event_updated
  before update on public.agenda_event
  for each row execute function public.set_updated_at();

drop trigger if exists memory_note_updated on public.memory_note;
create trigger memory_note_updated
  before update on public.memory_note
  for each row execute function public.set_updated_at();

drop trigger if exists item_updated on public.item;
create trigger item_updated
  before update on public.item
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
--  5. Audit
--  Alleen op de gevoelige tabellen. Wie, wat, wanneer.
-- ---------------------------------------------------------------------

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;

  insert into public.audit_log (household_id, actor_id, table_name, row_id, action)
  values (r.household_id, auth.uid(), tg_table_name, r.id, tg_op);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists document_audit on public.document;
create trigger document_audit
  after insert or update or delete on public.document
  for each row execute function public.write_audit();

drop trigger if exists medication_audit on public.medication;
create trigger medication_audit
  after insert or update or delete on public.medication
  for each row execute function public.write_audit();

drop trigger if exists membership_audit on public.membership;
create trigger membership_audit
  after insert or update or delete on public.membership
  for each row execute function public.write_audit();

drop trigger if exists location_audit on public.location_setting;
create trigger location_audit
  after insert or update on public.location_setting
  for each row execute function public.write_audit();


-- ---------------------------------------------------------------------
--  6. Row level security
--
--  Patroon: lezen = elk lid van het huishouden, schrijven = admin en
--  member. De persoon en de zorgverlener krijgen bewust geen schrijfrecht;
--  wat zij wél mogen doen (afvinken, bevestigen) loopt via de RPC's in
--  deel 7.
-- ---------------------------------------------------------------------

alter table public.household        enable row level security;
alter table public.profile          enable row level security;
alter table public.membership       enable row level security;
alter table public.person_card      enable row level security;
alter table public.routine          enable row level security;
alter table public.routine_step     enable row level security;
alter table public.agenda_event     enable row level security;
alter table public.room             enable row level security;
alter table public.item             enable row level security;
alter table public.item_step        enable row level security;
alter table public.memory_note      enable row level security;
alter table public.memory_photo     enable row level security;
alter table public.medication       enable row level security;
alter table public.medication_log   enable row level security;
alter table public.care_log         enable row level security;
alter table public.document         enable row level security;
alter table public.notification     enable row level security;
alter table public.location_setting enable row level security;
alter table public.audit_log        enable row level security;

-- household
drop policy if exists household_read on public.household;
create policy household_read on public.household for select
  using (public.is_member(id));

drop policy if exists household_write on public.household;
create policy household_write on public.household for update
  using (public.auth_role(id) = 'admin')
  with check (public.auth_role(id) = 'admin');

-- profile
drop policy if exists profile_self on public.profile;
create policy profile_self on public.profile for select
  using (id = auth.uid());

drop policy if exists profile_shared on public.profile;
create policy profile_shared on public.profile for select
  using (public.shares_household(id));

drop policy if exists profile_update_self on public.profile;
create policy profile_update_self on public.profile for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- membership: iedereen in het huishouden ziet wie erbij hoort,
-- alleen de beheerder wijzigt rollen
drop policy if exists membership_read on public.membership;
create policy membership_read on public.membership for select
  using (public.is_member(household_id) or profile_id = auth.uid());

drop policy if exists membership_admin on public.membership;
create policy membership_admin on public.membership for all
  using (public.auth_role(household_id) = 'admin')
  with check (public.auth_role(household_id) = 'admin');

-- de gewone tabellen: lezen als lid, schrijven als admin of member
do $$
declare
  t text;
begin
  foreach t in array array[
    'person_card', 'routine', 'routine_step', 'agenda_event',
    'room', 'item', 'item_step', 'memory_note', 'memory_photo',
    'medication', 'medication_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_member(household_id))',
      t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all '
      'using (public.auth_role(household_id) in (''admin'', ''member'')) '
      'with check (public.auth_role(household_id) in (''admin'', ''member''))',
      t || '_write', t);
  end loop;
end
$$;

-- medicatie mag de zorgverlener óók lezen en bevestigen (via de RPC)
-- zorglogboek: de zorgverlener schrijft wel, maar wist niets
drop policy if exists care_log_read on public.care_log;
create policy care_log_read on public.care_log for select
  using (public.auth_role(household_id) in ('admin', 'member', 'caregiver'));

drop policy if exists care_log_insert on public.care_log;
create policy care_log_insert on public.care_log for insert
  with check (public.auth_role(household_id) in ('admin', 'member', 'caregiver'));

drop policy if exists care_log_update on public.care_log;
create policy care_log_update on public.care_log for update
  using (author_id = auth.uid() or public.auth_role(household_id) = 'admin')
  with check (author_id = auth.uid() or public.auth_role(household_id) = 'admin');

drop policy if exists care_log_delete on public.care_log;
create policy care_log_delete on public.care_log for delete
  using (public.auth_role(household_id) = 'admin');

-- documenten: niet voor de persoon, niet voor de zorgverlener
drop policy if exists document_read on public.document;
create policy document_read on public.document for select
  using (public.auth_role(household_id) in ('admin', 'member'));

drop policy if exists document_write on public.document;
create policy document_write on public.document for all
  using (public.auth_role(household_id) = 'admin')
  with check (public.auth_role(household_id) = 'admin');

-- meldingen: gericht op een rol, of op iedereen
drop policy if exists notification_read on public.notification;
create policy notification_read on public.notification for select
  using (
    public.is_member(household_id)
    and (target_role is null or target_role = public.auth_role(household_id))
  );

drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification for update
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- locatie: iedereen in het huishouden ziet de instelling staan,
-- alleen de beheerder zet ze aan of uit
drop policy if exists location_read on public.location_setting;
create policy location_read on public.location_setting for select
  using (public.is_member(household_id));

drop policy if exists location_write on public.location_setting;
create policy location_write on public.location_setting for all
  using (public.auth_role(household_id) = 'admin')
  with check (public.auth_role(household_id) = 'admin');

-- audit: alleen lezen, alleen de beheerder
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select
  using (public.auth_role(household_id) = 'admin');


-- ---------------------------------------------------------------------
--  7. RPC's
--
--  Een with check kan niet zeggen "alleen deze kolom". Daarom krijgt de
--  persoon geen update-policy, maar deze twee functies. Meteen ook de
--  plek waar het zorglogboek vanzelf mee geschreven wordt.
-- ---------------------------------------------------------------------

create or replace function public.mark_done(event_id uuid, done boolean default true)
returns public.agenda_event
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.agenda_event;
  r public.member_role;
begin
  select * into e from public.agenda_event where id = event_id;
  if not found then
    raise exception 'Onbekend agenda-item';
  end if;

  r := public.auth_role(e.household_id);
  if r is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  update public.agenda_event
     set done_at = case when done then now() else null end,
         done_by = case when done then auth.uid() else null end
   where id = event_id
   returning * into e;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (
    e.household_id,
    now(),
    e.title || case when done then ' afgevinkt' else ' opnieuw opengezet' end,
    auth.uid(),
    case when r = 'person' then 'person'
         when r = 'caregiver' then 'caregiver'
         else 'family' end
  );

  return e;
end;
$$;

create or replace function public.confirm_medication(log_id uuid, taken boolean default true)
returns public.medication_log
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.medication_log;
  m public.medication;
  r public.member_role;
begin
  select * into l from public.medication_log where id = log_id;
  if not found then
    raise exception 'Onbekend medicatiemoment';
  end if;

  r := public.auth_role(l.household_id);
  if r is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select * into m from public.medication where id = l.medication_id;

  update public.medication_log
     set taken_at = case when taken then now() else null end,
         confirmed_by = case when taken then auth.uid() else null end
   where id = log_id
   returning * into l;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (
    l.household_id,
    now(),
    m.name || case when taken then ' bevestigd' else ' terug opengezet' end,
    auth.uid(),
    case when r = 'person' then 'person'
         when r = 'caregiver' then 'caregiver'
         else 'family' end
  );

  return l;
end;
$$;

-- Zet de medicatiemomenten van vandaag klaar. Roep dit één keer per nacht
-- aan vanuit een cron job of een edge function.
create or replace function public.ensure_medication_log(hh uuid, on_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  n integer := 0;
  med record;
begin
  select timezone into tz from public.household where id = hh;
  if tz is null then
    raise exception 'Onbekend huishouden';
  end if;

  for med in select * from public.medication where household_id = hh and active loop
    insert into public.medication_log (medication_id, household_id, due_at)
    values (med.id, hh, ((on_day + med.at_time) at time zone tz))
    on conflict (medication_id, due_at) do nothing;
    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Een huishouden aanmaken kan niet via een insert-policy: op dat moment
-- is er nog geen membership om tegen te toetsen. Vandaar deze functie,
-- die het huishouden, de beheerder en de kaart van de persoon in één keer
-- zet. Dit is stap 1 van de onboarding.
create or replace function public.create_household(
  person_name text,
  tz text default 'Europe/Brussels',
  address text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  insert into public.household (person_name, timezone, address)
  values (person_name, tz, address)
  returning id into hh;

  insert into public.membership (household_id, profile_id, role)
  values (hh, auth.uid(), 'admin');

  insert into public.person_card (household_id, name, relation, kind, description, sort)
  values (hh, person_name, 'Jij', 'self', 'Dit ben jij.', 0);

  insert into public.location_setting (household_id) values (hh);

  return hh;
end;
$$;

grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.ensure_medication_log(uuid, date) to authenticated;
grant execute on function public.mark_done(uuid, boolean) to authenticated;
grant execute on function public.confirm_medication(uuid, boolean) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.auth_role(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  8. Storage
--
--  Vier buckets, allemaal privé. Het pad begint altijd met het
--  household_id, want dat is waar de policy op aangrijpt.
--  Lukt dit deel niet door rechten op storage.objects, maak de buckets
--  dan via Dashboard → Storage en plak alleen de policies opnieuw.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false),
       ('home-memory', 'home-memory', false),
       ('memories', 'memories', false),
       ('documents', 'documents', false)
on conflict (id) do nothing;

do $$
declare
  b text;
begin
  foreach b in array array['avatars', 'home-memory', 'memories'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_read');
    execute format(
      'create policy %I on storage.objects for select using ('
      '  bucket_id = %L and public.is_member(((storage.foldername(name))[1])::uuid))',
      b || '_read', b);

    execute format('drop policy if exists %I on storage.objects', b || '_write');
    execute format(
      'create policy %I on storage.objects for insert with check ('
      '  bucket_id = %L and public.auth_role(((storage.foldername(name))[1])::uuid) '
      '  in (''admin'', ''member''))',
      b || '_write', b);

    execute format('drop policy if exists %I on storage.objects', b || '_delete');
    execute format(
      'create policy %I on storage.objects for delete using ('
      '  bucket_id = %L and public.auth_role(((storage.foldername(name))[1])::uuid) '
      '  in (''admin'', ''member''))',
      b || '_delete', b);
  end loop;
end
$$;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select
  using (
    bucket_id = 'documents'
    and public.auth_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
  );

drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and public.auth_role(((storage.foldername(name))[1])::uuid) = 'admin'
  );

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete
  using (
    bucket_id = 'documents'
    and public.auth_role(((storage.foldername(name))[1])::uuid) = 'admin'
  );


-- ---------------------------------------------------------------------
--  9. Realtime
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.agenda_event;
exception when others then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.medication_log;
exception when others then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.care_log;
exception when others then null;
end
$$;


-- ---------------------------------------------------------------------
--  10. Optioneel: AI-laag (pgvector)
--
--  Zet eerst de extensie 'vector' aan via Dashboard → Database →
--  Extensions. Verwijder daarna het commentaar hieronder en draai het.
--  De app moet volledig werken zonder dit deel.
-- ---------------------------------------------------------------------

-- create extension if not exists vector with schema extensions;
--
-- alter table public.memory_note add column if not exists embedding extensions.vector(1536);
-- alter table public.item        add column if not exists embedding extensions.vector(1536);
--
-- create index if not exists memory_note_embedding_idx
--   on public.memory_note using ivfflat (embedding extensions.vector_cosine_ops)
--   with (lists = 100);
--
-- create or replace function public.match_memory(
--   hh uuid,
--   query_embedding extensions.vector(1536),
--   match_count integer default 5)
-- returns table (id uuid, title text, body text, similarity double precision)
-- language sql
-- stable
-- security definer
-- set search_path = public, extensions
-- as $$
--   select n.id, n.title, n.body, 1 - (n.embedding <=> query_embedding)
--   from public.memory_note n
--   where n.household_id = hh
--     and public.is_member(hh)
--     and n.embedding is not null
--   order by n.embedding <=> query_embedding
--   limit match_count;
-- $$;


-- =====================================================================
--  Klaar. Draai daarna 02_demo_data.sql om het huishouden van Maria
--  Janssens te vullen, of begin meteen met een eigen huishouden.
-- =====================================================================
