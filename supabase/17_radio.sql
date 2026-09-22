-- =====================================================================
--  THUIS — radio
--  Supabase migratie, versie 17
--
--  Draai dit na 01_schema.sql.
--
--  Hoogstens een handvol zenders, gekozen door familie of door de persoon
--  zelf. De eerste in de lijst is de favoriet: die speelt bij één tik.
--  De streams zelf komen van de zenders; hier staat alleen welke.
-- =====================================================================

create table if not exists public.radio_station (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  name          text not null,
  stream_url    text not null check (stream_url like 'https://%'),
  favicon       text,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);

comment on column public.radio_station.stream_url is
  'Alleen https: de app draait zelf op https, en een browser weigert een onbeveiligde stream.';

create index if not exists radio_station_hh_idx on public.radio_station (household_id, sort);

alter table public.radio_station enable row level security;

drop policy if exists radio_read on public.radio_station;
create policy radio_read on public.radio_station for select
  using (public.is_member(household_id));

drop policy if exists radio_write on public.radio_station;
create policy radio_write on public.radio_station for all
  using (public.auth_role(household_id) in ('admin', 'member'))
  with check (public.auth_role(household_id) in ('admin', 'member'));
