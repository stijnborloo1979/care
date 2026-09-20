-- =====================================================================
--  THUIS — berichten
--  Supabase migratie, versie 4
--
--  Draai dit na 01_schema.sql. 03_organisations.sql is niet vereist:
--  ontbreekt die, dan maakt deel 0 hieronder family_role() zelf aan. Staat
--  03 er wel, dan is het dezelfde definitie. Medewerkers van een
--  zorgorganisatie horen sowieso niet in de familiedraad.
--
--  Twee kanalen, één tabel:
--
--    channel = 'family'   De draad tussen Els, Jan en Sofie. Maria ziet
--                         die nooit. Dit vervangt de WhatsApp-groep waar
--                         nu de helft van de afspraken in verdwijnt.
--
--    channel = 'person'   Berichten áán Maria, die op haar Vandaag-scherm
--                         verschijnen. Bij voorkeur ingesproken: een stem
--                         werkt waar lezen niet meer lukt. Ze verdwijnen
--                         vanzelf na twee dagen, zodat het scherm niet
--                         volloopt met oude boodschappen.
--
--  Let op het verschil met care_log: dat zijn notities ÓVER Maria, dit
--  zijn berichten AAN haar of tussen de familie.
-- =====================================================================


-- ---------------------------------------------------------------------
--  0. family_role()
--
--  Deze migratie leunt erop. Staat 03 al geïnstalleerd, dan is dit
--  dezelfde definitie en verandert er niets. Staat 03 er niet, dan heb je
--  hem hier alsnog: alleen wat de familie zelf heeft toegekend, zonder de
--  organisatie-tak.
-- ---------------------------------------------------------------------

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

grant execute on function public.family_role(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.message (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  channel        text not null check (channel in ('family', 'person')),
  author_id      uuid references public.profile (id) on delete set null,
  author_name    text,
  body           text,
  audio_path     text,
  audio_seconds  integer,
  photo_path     text,
  reply_to       uuid references public.message (id) on delete set null,
  pinned         boolean not null default false,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  constraint message_has_content
    check (body is not null or audio_path is not null or photo_path is not null)
);

comment on column public.message.author_name is
  'Naam op het moment van verzenden. Een verwijderd account laat de draad zo niet leeg achter.';
comment on column public.message.pinned is
  'Een vastgezet bericht blijft op Maria''s scherm staan, ook na expires_at.';

create table if not exists public.message_read (
  message_id  uuid not null references public.message (id) on delete cascade,
  profile_id  uuid not null references public.profile (id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (message_id, profile_id)
);

create index if not exists message_hh_channel_idx on public.message (household_id, channel, created_at desc);
create index if not exists message_live_idx       on public.message (household_id, expires_at);
create index if not exists message_read_pid_idx   on public.message_read (profile_id);


-- ---------------------------------------------------------------------
--  2. Automatisch invullen bij verzenden
-- ---------------------------------------------------------------------

create or replace function public.stamp_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_id is null then
    new.author_id := auth.uid();
  end if;

  if new.author_name is null then
    select coalesce(p.full_name, 'Onbekend') into new.author_name
      from public.profile p where p.id = new.author_id;
  end if;

  -- Berichten aan de persoon verdwijnen vanzelf. De familiedraad blijft.
  if new.channel = 'person' and new.expires_at is null then
    new.expires_at := now() + interval '2 days';
  end if;

  return new;
end;
$$;

drop trigger if exists message_stamp on public.message;
create trigger message_stamp
  before insert on public.message
  for each row execute function public.stamp_message();


-- ---------------------------------------------------------------------
--  3. RLS
--
--  Bewust family_role() en niet auth_role(): een coördinator van een
--  zorgorganisatie hoort niet mee te lezen in de familiedraad, en een
--  verpleegkundige evenmin. Dit is privécorrespondentie, geen dossier.
-- ---------------------------------------------------------------------

alter table public.message      enable row level security;
alter table public.message_read enable row level security;

-- lezen: de familie ziet beide kanalen, Maria alleen wat voor haar is
drop policy if exists message_read_family on public.message;
create policy message_read_family on public.message for select
  using (public.family_role(household_id) in ('admin', 'member'));

drop policy if exists message_read_person on public.message;
create policy message_read_person on public.message for select
  using (
    channel = 'person'
    and public.family_role(household_id) = 'person'
  );

-- schrijven in de familiedraad: alleen familie
drop policy if exists message_write_family on public.message;
create policy message_write_family on public.message for insert
  with check (
    channel = 'family'
    and public.family_role(household_id) in ('admin', 'member')
    and author_id = auth.uid()
  );

-- schrijven aan Maria: familie stuurt, Maria mag antwoorden
drop policy if exists message_write_person on public.message;
create policy message_write_person on public.message for insert
  with check (
    channel = 'person'
    and public.family_role(household_id) in ('admin', 'member', 'person')
    and author_id = auth.uid()
  );

-- aanpassen: alleen je eigen bericht, en alleen vastzetten of de
-- vervaldatum verschuiven (de rest handhaaf je in de app)
drop policy if exists message_update_own on public.message;
create policy message_update_own on public.message for update
  using (author_id = auth.uid() or public.family_role(household_id) = 'admin')
  with check (author_id = auth.uid() or public.family_role(household_id) = 'admin');

drop policy if exists message_delete_own on public.message;
create policy message_delete_own on public.message for delete
  using (author_id = auth.uid() or public.family_role(household_id) = 'admin');

-- leesbevestigingen: je schrijft alleen die van jezelf
drop policy if exists message_read_select on public.message_read;
create policy message_read_select on public.message_read for select
  using (
    exists (
      select 1 from public.message m
      where m.id = message_id and public.is_member(m.household_id)
    )
  );

drop policy if exists message_read_insert on public.message_read;
create policy message_read_insert on public.message_read for insert
  with check (profile_id = auth.uid());


-- ---------------------------------------------------------------------
--  4. Wat Maria nu te zien krijgt
--
--  security_invoker: de view draait met de rechten van wie ze opvraagt,
--  dus RLS blijft gelden. Maria krijgt hier nooit de familiedraad uit.
-- ---------------------------------------------------------------------

create or replace view public.person_inbox
with (security_invoker = true) as
select
  m.id,
  m.household_id,
  m.author_name,
  m.body,
  m.audio_path,
  m.audio_seconds,
  m.photo_path,
  m.pinned,
  m.created_at,
  exists (
    select 1 from public.message_read r
    where r.message_id = m.id and r.profile_id = auth.uid()
  ) as seen
from public.message m
where m.channel = 'person'
  and (m.pinned or m.expires_at is null or m.expires_at > now())
order by m.pinned desc, m.created_at desc;

grant select on public.person_inbox to authenticated;

comment on view public.person_inbox is
  'De berichten die nu op het Vandaag-scherm van de persoon horen te staan.';


-- ---------------------------------------------------------------------
--  5. Functies
-- ---------------------------------------------------------------------

create or replace function public.mark_message_read(msg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.message where id = msg;
  if hh is null then
    raise exception 'Onbekend bericht';
  end if;

  if not public.is_member(hh) then
    raise exception 'Geen toegang';
  end if;

  insert into public.message_read (message_id, profile_id)
  values (msg, auth.uid())
  on conflict (message_id, profile_id) do nothing;
end;
$$;

-- Hoeveel nieuwe berichten staan er voor mij klaar, per kanaal?
create or replace function public.unread_count(hh uuid)
returns table (channel text, unread bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.channel, count(*)
  from public.message m
  where m.household_id = hh
    and m.author_id is distinct from auth.uid()
    and not exists (
      select 1 from public.message_read r
      where r.message_id = m.id and r.profile_id = auth.uid()
    )
  group by m.channel;
$$;

-- Ruim verlopen berichten op. Roep dit één keer per nacht aan, samen met
-- ensure_medication_log(). Vastgezette berichten blijven staan.
create or replace function public.cleanup_expired_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.message
   where channel = 'person'
     and not pinned
     and expires_at is not null
     and expires_at < now() - interval '7 days';

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.unread_count(uuid)      to authenticated;


-- ---------------------------------------------------------------------
--  6. Opslag voor spraakberichten en foto's
--
--  Pad: <household_id>/<channel>/<uuid>.webm
--  Het tweede segment bepaalt of Maria erbij kan.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('messages', 'messages', false, 10485760)
on conflict (id) do nothing;

drop policy if exists messages_read on storage.objects;
create policy messages_read on storage.objects for select
  using (
    bucket_id = 'messages'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member', 'person')
    and (
      (storage.foldername(name))[2] <> 'family'
      or public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
    )
  );

drop policy if exists messages_write on storage.objects;
create policy messages_write on storage.objects for insert
  with check (
    bucket_id = 'messages'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member', 'person')
    and (
      (storage.foldername(name))[2] <> 'family'
      or public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
    )
  );

drop policy if exists messages_delete on storage.objects;
create policy messages_delete on storage.objects for delete
  using (
    bucket_id = 'messages'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
  );


-- ---------------------------------------------------------------------
--  7. Realtime
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.message;
exception when others then null;
end
$$;


-- ---------------------------------------------------------------------
--  8. Twee voorbeeldberichten voor het demohuishouden
--     (slaat zichzelf over als 02_demo_data.sql niet gedraaid is)
-- ---------------------------------------------------------------------

do $$
declare
  hh    uuid;
  admin uuid;
begin
  select id into hh from public.household where person_name = 'Maria Janssens' limit 1;
  if hh is null then
    return;
  end if;

  select profile_id into admin
    from public.membership where household_id = hh and role = 'admin' limit 1;

  insert into public.message (household_id, channel, author_id, author_name, body, expires_at)
  values (hh, 'person', admin, 'Els',
          'Ik kom straks langs met koffiekoeken. Blijf maar rustig zitten.',
          now() + interval '2 days');

  insert into public.message (household_id, channel, author_id, author_name, body)
  values (hh, 'family', admin, 'Els',
          'Ik neem mama morgen mee naar de dokter. Jan, kan jij zondag?');
end
$$;


-- =====================================================================
--  In de app
--
--  Familiedraad:  select * from message where channel = 'family'
--                 order by created_at
--  Bij Maria:     select * from person_inbox
--
--  Het opnemen van een spraakbericht gebeurt in de browser met
--  MediaRecorder, opslaan als audio/webm in de bucket 'messages', en het
--  pad in audio_path. Op Vandaag wordt dat één grote knop met de foto van
--  de afzender: indrukken, afspelen, klaar. Geen lijst, geen lezen.
-- =====================================================================
