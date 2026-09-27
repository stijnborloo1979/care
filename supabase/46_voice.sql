-- =====================================================================
--  LIFEANGLE — LifeAngle Voice
--  Supabase migratie, versie 46
--
--  Draai dit na 45_gedeeld_huis.sql.
--
--  Waarom
--  ------
--  Met LifeAngle Voice zegt de persoon gewoon wat ze nodig heeft:
--  "morgen om twee uur dokter", "ik moet melk en brood kopen", "ik wil
--  iets vertellen". Een taalmodel bepaalt alleen WAT ze bedoelt. Wat er
--  daarna in de database gebeurt, loopt uitsluitend via de functies
--  hieronder — nooit via vrije queries die het model zou kiezen.
--
--  Wat er verandert
--  ----------------
--  1. agenda_event.kind kent 'reminder': een herinnering wordt op het
--     uur zelf uitgesproken, niet tien minuten vooraf.
--  2. Een boodschappenlijst (shopping_item). De persoon mag er zelf aan
--     toevoegen en afvinken; familie ziet ze ook.
--  3. life_story krijgt een soort ('verhaal' of 'dagboek') en een titel.
--     Het gesproken dagboek hergebruikt zo de opslag, de opnames en de
--     deel-knop van "Vertel eens".
--  4. voice_action: elke uitgevoerde spraakactie één keer. Twee keer op
--     JA tikken, of een verbinding die de vraag opnieuw verstuurt, maakt
--     geen tweede afspraak.
--  5. voice_add_event en voice_add_shopping: de enige deuren waarlangs
--     een spraakopdracht schrijft. Ook de tablet (rol 'person') mag ze
--     gebruiken, binnen strakke grenzen. Rechtstreeks in agenda_event
--     schrijven blijft voor de tablet verboden.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Herinneringen als soort agenda-item
-- ---------------------------------------------------------------------

alter table public.agenda_event drop constraint if exists agenda_event_kind_check;
alter table public.agenda_event
  add constraint agenda_event_kind_check
  check (kind in ('meal', 'med', 'visit', 'appt', 'routine', 'other', 'reminder'));


-- ---------------------------------------------------------------------
--  2. Boodschappenlijst
-- ---------------------------------------------------------------------

create table if not exists public.shopping_item (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  done_at       timestamptz,
  created_by    uuid references public.profile (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists shopping_item_hh_idx
  on public.shopping_item (household_id, done_at, created_at desc);

alter table public.shopping_item enable row level security;

drop policy if exists shopping_read on public.shopping_item;
create policy shopping_read on public.shopping_item for select
  using (public.is_member(household_id));

drop policy if exists shopping_insert on public.shopping_item;
create policy shopping_insert on public.shopping_item for insert
  with check (
    public.auth_role(household_id) in ('admin', 'member', 'person')
    and created_by = auth.uid()
  );

-- Afvinken mag iedereen die ook mag toevoegen.
drop policy if exists shopping_update on public.shopping_item;
create policy shopping_update on public.shopping_item for update
  using (public.auth_role(household_id) in ('admin', 'member', 'person'))
  with check (public.auth_role(household_id) in ('admin', 'member', 'person'));

drop policy if exists shopping_delete on public.shopping_item;
create policy shopping_delete on public.shopping_item for delete
  using (created_by = auth.uid() or public.auth_role(household_id) in ('admin', 'member'));

do $$
begin
  alter publication supabase_realtime add table public.shopping_item;
exception when others then null;
end
$$;


-- ---------------------------------------------------------------------
--  3. Het gesproken dagboek
-- ---------------------------------------------------------------------

alter table public.life_story
  add column if not exists soort text not null default 'verhaal';
alter table public.life_story
  add column if not exists titel text;

alter table public.life_story drop constraint if exists life_story_soort_check;
alter table public.life_story
  add constraint life_story_soort_check check (soort in ('verhaal', 'dagboek'));


-- ---------------------------------------------------------------------
--  4. Elke spraakactie één keer
-- ---------------------------------------------------------------------

create table if not exists public.voice_action (
  action_id     uuid primary key,
  household_id  uuid not null references public.household (id) on delete cascade,
  intent        text not null,
  created_by    uuid references public.profile (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

alter table public.voice_action enable row level security;

-- Alleen lezen; schrijven gebeurt uitsluitend in de functies hieronder.
drop policy if exists voice_action_read on public.voice_action;
create policy voice_action_read on public.voice_action for select
  using (public.is_member(household_id));


-- ---------------------------------------------------------------------
--  5. De deuren
-- ---------------------------------------------------------------------

alter table public.agenda_event
  add column if not exists voice_action_id uuid;

-- Een afspraak of herinnering. Geeft het id terug; bij een herhaalde
-- action_id het id van de eerste keer, zonder iets nieuws te maken.
create or replace function public.voice_add_event(
  hh        uuid,
  starts    timestamptz,
  titel     text,
  soort     text,
  emoji     text,
  notitie   text,
  action_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.member_role;
  nieuw  uuid;
  bestaand uuid;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om de agenda te wijzigen';
  end if;

  if soort not in ('appt', 'reminder', 'visit', 'other') then
    raise exception 'Deze soort kan niet via spraak';
  end if;
  titel := btrim(coalesce(titel, ''));
  if char_length(titel) < 1 or char_length(titel) > 120 then
    raise exception 'Ongeldige titel';
  end if;
  -- Niet in het verleden (een kwartier speling voor "nu meteen"), en niet
  -- verder dan twee jaar vooruit: dat is bijna zeker een verkeerd verstaan
  -- jaartal.
  if starts < now() - interval '15 minutes' or starts > now() + interval '2 years' then
    raise exception 'Ongeldig tijdstip';
  end if;

  if action_id is not null then
    insert into public.voice_action (action_id, household_id, intent)
    values (action_id, hh, 'event:' || soort)
    on conflict do nothing;
    if not found then
      select e.id into bestaand from public.agenda_event e
       where e.household_id = hh and e.voice_action_id = voice_add_event.action_id;
      return bestaand;
    end if;
  end if;

  insert into public.agenda_event
    (household_id, starts_at, title, kind, emoji, note, created_by, voice_action_id)
  values
    (hh, starts, titel, soort, nullif(emoji, ''), nullif(btrim(coalesce(notitie, '')), ''),
     auth.uid(), action_id)
  returning id into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.voice_add_event(uuid, timestamptz, text, text, text, text, uuid)
  to authenticated;


-- Eén of meer producten. Geeft het aantal toegevoegde producten terug.
-- Wat al open op de lijst staat, komt er geen tweede keer bij.
create or replace function public.voice_add_shopping(
  hh        uuid,
  namen     text[],
  action_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      public.member_role;
  n      text;
  aantal integer := 0;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om de boodschappenlijst te wijzigen';
  end if;
  if namen is null or array_length(namen, 1) is null or array_length(namen, 1) > 20 then
    raise exception 'Ongeldige lijst';
  end if;

  if action_id is not null then
    insert into public.voice_action (action_id, household_id, intent)
    values (action_id, hh, 'shopping')
    on conflict do nothing;
    if not found then
      return 0;
    end if;
  end if;

  foreach n in array namen loop
    n := btrim(n);
    continue when char_length(n) < 1 or char_length(n) > 80;
    continue when exists (
      select 1 from public.shopping_item s
       where s.household_id = hh and s.done_at is null and lower(s.name) = lower(n)
    );
    insert into public.shopping_item (household_id, name, created_by)
    values (hh, n, auth.uid());
    aantal := aantal + 1;
  end loop;

  return aantal;
end;
$$;

grant execute on function public.voice_add_shopping(uuid, text[], uuid) to authenticated;
