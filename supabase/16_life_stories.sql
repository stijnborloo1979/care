-- =====================================================================
--  THUIS — "Vertel eens": levensverhalen
--  Supabase migratie, versie 16
--
--  Draai dit na 01_schema.sql. Gebruikt is_self() uit 14; ontbreekt die,
--  dan maakt dit bestand hem zelf aan.
--
--  Elke dag één vraag over het eigen leven. De persoon antwoordt, bij
--  voorkeur ingesproken, en het antwoord blijft bewaard. Na een jaar heeft
--  de familie een levensverhaal in zijn eigen stem.
--
--  Standaard gedeeld met familie — daar is het voor bedoeld — maar per
--  verhaal kan de persoon kiezen het voor zichzelf te houden.
--
--  De opnames staan in de bucket 'messages', onder
--  <household_id>/verhalen/. De bestaande policies daar laten de persoon
--  al toe om te schrijven, en houden zorgverleners buiten.
-- =====================================================================

-- is_self() komt uit 14_ownership.sql. Staat die nog niet, dan maken we
-- hem hier aan, met dezelfde definitie: zo werkt dit bestand ook los.
create or replace function public.is_self(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.person_card
    where household_id = hh and kind = 'self' and profile_id = auth.uid()
  );
$$;

grant execute on function public.is_self(uuid) to authenticated;

create table if not exists public.life_story (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  question       text not null,
  body           text,
  audio_path     text,
  audio_seconds  integer,
  shared         boolean not null default true,
  created_by     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint life_story_has_content check (body is not null or audio_path is not null)
);

create index if not exists life_story_hh_idx on public.life_story (household_id, created_at desc);

alter table public.life_story enable row level security;

drop policy if exists life_story_read on public.life_story;
create policy life_story_read on public.life_story for select
  using (
    public.is_self(household_id)
    or created_by = auth.uid()
    or (public.is_member(household_id) and shared)
  );

drop policy if exists life_story_insert on public.life_story;
create policy life_story_insert on public.life_story for insert
  with check (
    public.auth_role(household_id) in ('admin', 'member', 'person')
    and created_by = auth.uid()
  );

-- Delen aan of uit zetten kan alleen wie het verhaal vertelde.
drop policy if exists life_story_update on public.life_story;
create policy life_story_update on public.life_story for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists life_story_delete on public.life_story;
create policy life_story_delete on public.life_story for delete
  using (created_by = auth.uid() or public.auth_role(household_id) = 'admin');

do $$
begin
  alter publication supabase_realtime add table public.life_story;
exception when others then null;
end
$$;
