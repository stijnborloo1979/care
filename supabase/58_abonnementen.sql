-- =====================================================================
--  LIFEANGLE — abonnementen en wat ze ontgrendelen (schaduwmodus)
--  Supabase migratie, versie 58
--
--  Draai dit na 57_noodtoegang_melding.sql.
--  Terugdraaien: supabase/rollback/58_abonnementen.sql
--  Tests: supabase/tests/test_58_abonnementen.sql
--
--  Wat dit doet
--  ------------
--  Legt vast welk plan een huishouden (Home) of een organisatie (Care)
--  heeft, in welke status, en welke functies (entitlements) dat
--  ontgrendelt. Telt ook de actieve bewoners per dag, voor de factuur van
--  een organisatie.
--
--  Wat dit NIET doet
--  -----------------
--  Niets wordt al afgedwongen. Geen enkele toegangsregel leest dit. Een
--  huishouden zonder abonnement (vandaag: allemaal) krijgt de bron
--  'bestaand' en alle functies. Afdwingen komt pas in een latere migratie,
--  na een beslissing over plannen en prijzen.
--
--  De plannen hieronder zijn VOORBEELDEN om de regels te kunnen testen.
--  Hun namen en inhoud zijn een zakelijke keuze, geen technische.
--
--  Regels (uit het voorstel)
--  -------------------------
--    trial      30 dagen alle functies van het plan, daarna home_free
--    pilot      einddatum verplicht; daarna telt ze als past_due
--    past_due   14 dagen alles, daarna alleen lezen; nooit wissen
--    cancelled  Home: terug naar home_free
--    paused     een Home-abonnement pauzeert zodra een Care-verblijf start,
--               en hervat wanneer het verblijf eindigt
--    Care       een bewoner met een open verblijf krijgt het plan van de
--               organisatie; dat gaat voor op het eigen Home-plan
--    actief     een bewoner telt mee op elke dag met een open verblijf,
--               tot en met de dag van het einde
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Functies (entitlements) en plannen
-- ---------------------------------------------------------------------

create table if not exists public.entitlement (
  key    text primary key,
  groep  text not null,
  label  text not null
);

insert into public.entitlement (key, groep, label) values
  ('agenda', 'core', 'Agenda'), ('reminders', 'core', 'Herinneringen'),
  ('contacts', 'core', 'Contacten'), ('messages', 'core', 'Berichten'),
  ('diary', 'core', 'Verhalen en dagboek'), ('memories', 'core', 'Herinneringen en foto''s'),
  ('voice_basic', 'core', 'Spraak zonder AI'),
  ('shopping', 'zelfstandig', 'Boodschappen'), ('home_memory', 'zelfstandig', 'Home Memory'),
  ('routines', 'zelfstandig', 'Routines'), ('medication', 'zelfstandig', 'Medicatie'),
  ('location', 'zelfstandig', 'Locatie'), ('radio', 'zelfstandig', 'Radio'),
  ('video_calls', 'zelfstandig', 'Videobellen'),
  ('family_portal', 'familie', 'Familieportaal'), ('family_tasks', 'familie', 'Taken'),
  ('documents', 'familie', 'Documenten'), ('analysis', 'familie', 'Analyse'),
  ('voice', 'ai', 'Spraak met AI'), ('voice_transcribe', 'ai', 'Spraak naar tekst'),
  ('ask', 'ai', 'Vragen uit eigen gegevens'),
  ('care_notes', 'zorg', 'Zorgnotities'), ('handover', 'zorg', 'Overdracht'),
  ('activities', 'zorg', 'Activiteiten'), ('team_messages', 'zorg', 'Teamberichten'),
  ('emergency_access', 'zorg', 'Noodtoegang'),
  ('org_dashboard', 'organisatie', 'Overzicht organisatie'), ('reports', 'organisatie', 'Rapporten'),
  ('reports_roi', 'organisatie', 'Rapporten met rendement'),
  ('companion', 'hardware', 'Companion-toestel'), ('room_devices', 'hardware', 'Toestellen per kamer'),
  ('epd_link', 'integratie', 'Koppeling met het EPD')
on conflict (key) do nothing;

create table if not exists public.plan (
  id            text primary key,
  product       text not null check (product in ('home', 'care')),
  naam          text not null,
  entitlements  text[] not null,
  voorbeeld     boolean not null default true
);

comment on table public.plan is
  'Plannen en wat ze ontgrendelen. De rijen met voorbeeld = true zijn voorbeelden om de regels te testen; naam en inhoud zijn een zakelijke keuze.';

do $$
declare
  core   text[] := array['agenda', 'reminders', 'contacts', 'messages', 'diary', 'memories', 'voice_basic'];
  zelf   text[] := array['shopping', 'home_memory', 'routines', 'medication', 'location', 'radio', 'video_calls'];
  fam    text[] := array['family_portal', 'family_tasks', 'documents', 'analysis'];
  ai     text[] := array['voice', 'voice_transcribe', 'ask'];
  zorg   text[] := array['care_notes', 'handover', 'activities', 'team_messages', 'emergency_access'];
  org    text[] := array['org_dashboard', 'reports'];
begin
  insert into public.plan (id, product, naam, entitlements) values
    ('home_free', 'home', 'Home gratis',         core),
    ('home',      'home', 'Home',                core || zelf || fam),
    ('home_ai',   'home', 'Home met AI',         core || zelf || fam || ai),
    ('care',      'care', 'Care',                core || zelf || fam || zorg || org),
    ('care_ai',   'care', 'Care met AI',         core || zelf || fam || zorg || org || ai)
  on conflict (id) do nothing;
end
$$;


-- ---------------------------------------------------------------------
--  2. Abonnementen
-- ---------------------------------------------------------------------

create table if not exists public.subscription (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid references public.household (id) on delete cascade,
  org_id              uuid references public.organisation (id) on delete cascade,
  plan_id             text not null references public.plan (id),
  status              text not null check (status in ('trial', 'pilot', 'active', 'past_due', 'paused', 'cancelled')),
  trial_ends_at       timestamptz,
  pilot_ends_at       timestamptz,
  pilot_max_residents integer check (pilot_max_residents > 0),
  past_due_since      timestamptz,
  paused_from         text check (paused_from in ('trial', 'active', 'past_due')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Home hoort bij een huishouden, Care bij een organisatie; nooit beide.
  check ((household_id is null) <> (org_id is null)),
  check (status <> 'trial' or trial_ends_at is not null),
  check (status <> 'pilot' or (pilot_ends_at is not null and org_id is not null)),
  check (status <> 'past_due' or past_due_since is not null)
);
create unique index if not exists subscription_een_per_hh  on public.subscription (household_id) where household_id is not null;
create unique index if not exists subscription_een_per_org on public.subscription (org_id) where org_id is not null;

comment on table public.subscription is
  'Eén abonnement per huishouden (Home) of per organisatie (Care). Wordt alleen door de server gezet (later: de betaalprovider).';

-- Een Care-plan hoort bij een organisatie, een Home-plan bij een huishouden.
create or replace function public.subscription_controle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p text;
begin
  select product into p from public.plan where id = new.plan_id;
  if (p = 'care') <> (new.org_id is not null) then
    raise exception 'Een Care-plan hoort bij een organisatie, een Home-plan bij een huishouden';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscription_controle on public.subscription;
create trigger subscription_controle before insert or update on public.subscription
  for each row execute function public.subscription_controle();

alter table public.entitlement  enable row level security;
alter table public.plan         enable row level security;
alter table public.subscription enable row level security;

drop policy if exists entitlement_read on public.entitlement;
create policy entitlement_read on public.entitlement for select using (auth.uid() is not null);
drop policy if exists plan_read on public.plan;
create policy plan_read on public.plan for select using (auth.uid() is not null);

-- Het eigen abonnement zien: de familiebeheerder (Home), de org admin (Care).
drop policy if exists subscription_read on public.subscription;
create policy subscription_read on public.subscription for select
  using (
    (household_id is not null and public.family_role(household_id) = 'admin')
    or (org_id is not null and public.org_role_of(org_id) = 'org_admin')
  );

revoke all on public.entitlement, public.plan, public.subscription from anon;
revoke insert, update, delete, truncate on public.entitlement, public.plan, public.subscription from authenticated;


-- ---------------------------------------------------------------------
--  3. Wat geldt er voor deze bewoner?
--
--  Puur rekenwerk, zonder bijwerkingen: een verlopen trial wordt niet
--  "omgezet", ze telt gewoon als home_free. Zo is er geen nachtjob nodig
--  om juist te zijn.
-- ---------------------------------------------------------------------

create or replace function public.entitlements_voor(hh uuid, op timestamptz default now())
returns table (entitlements text[], alleen_lezen boolean, bron text, plan_id text, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s     public.subscription;
  pl    public.plan;
  st    text;
  vrij  text[];
begin
  select p.entitlements into vrij from public.plan p where p.id = 'home_free';

  -- 1. Care: een open verblijf bij een organisatie met een abonnement.
  select sub.* into s
    from public.stay y
    join public.subscription sub on sub.org_id = y.org_id
   where y.household_id = hh and y.ended_at is null
   limit 1;

  if s.id is not null then
    st := s.status;
    if st = 'pilot' and s.pilot_ends_at <= op then
      st := 'past_due';
      s.past_due_since := s.pilot_ends_at;
    end if;
    if st = 'cancelled' then
      -- Care opgezegd: de verblijven sluiten vraagt een bevestiging van de
      -- org admin. Tot dan: alleen lezen, niets verdwijnt.
      select * into pl from public.plan where id = s.plan_id;
      return query select pl.entitlements, true, 'care', s.plan_id, st;
      return;
    end if;
    select * into pl from public.plan where id = s.plan_id;
    return query select pl.entitlements,
                        (st = 'past_due' and s.past_due_since <= op - interval '14 days'),
                        'care', s.plan_id, st;
    return;
  end if;

  -- 2. Home: het eigen abonnement.
  select * into s from public.subscription where household_id = hh;
  if s.id is null then
    -- Geen abonnement: zoals vandaag, alles. Dit blijft zo tot er bewust
    -- wordt afgedwongen.
    return query select array(select key from public.entitlement order by key), false, 'bestaand', null::text, null::text;
    return;
  end if;

  select * into pl from public.plan where id = s.plan_id;
  st := s.status;

  if st = 'trial' and s.trial_ends_at <= op then
    return query select vrij, false, 'home', 'home_free'::text, 'trial_verlopen'::text;
  elsif st = 'cancelled' then
    return query select vrij, false, 'home', 'home_free'::text, st;
  elsif st = 'paused' then
    -- Gepauzeerd zonder open verblijf (zou niet mogen gebeuren): het plan
    -- van voor de pauze, alleen lezen niet nodig.
    return query select pl.entitlements, false, 'home', s.plan_id, st;
  else
    return query select pl.entitlements,
                        (st = 'past_due' and s.past_due_since <= op - interval '14 days'),
                        'home', s.plan_id, st;
  end if;
end;
$$;

revoke execute on function public.entitlements_voor(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.entitlements_voor(uuid, timestamptz) to service_role;

-- Voor de app (later): wat geldt er voor dit huishouden? Alleen voor wie
-- er een relatie mee heeft.
create or replace function public.mijn_entitlements(hh uuid)
returns table (entitlements text[], alleen_lezen boolean, bron text, plan_id text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select e.* from public.entitlements_voor(hh) e
   where public.auth_role(hh) is not null or public.is_self(hh);
$$;

revoke execute on function public.mijn_entitlements(uuid) from public, anon;
grant execute on function public.mijn_entitlements(uuid) to authenticated, service_role;

-- Heeft dit huishouden deze functie? (Nog door geen enkele regel gebruikt.)
create or replace function public.has_entitlement(hh uuid, sleutel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sleutel = any (e.entitlements) from public.entitlements_voor(hh) e), false);
$$;

revoke execute on function public.has_entitlement(uuid, text) from public, anon;
grant execute on function public.has_entitlement(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  4. Home pauzeert tijdens een Care-verblijf
-- ---------------------------------------------------------------------

create or replace function public.home_pauze_bij_verblijf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.ended_at is null then
    update public.subscription
       set paused_from = status, status = 'paused'
     where household_id = new.household_id
       and status in ('trial', 'active', 'past_due');
  elsif tg_op = 'UPDATE' and new.ended_at is not null and old.ended_at is null then
    -- Alleen hervatten als er geen ander open verblijf is (overplaatsing).
    if not exists (select 1 from public.stay
                    where household_id = new.household_id and ended_at is null and id <> new.id) then
      update public.subscription
         set status = paused_from, paused_from = null
       where household_id = new.household_id
         and status = 'paused' and paused_from is not null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.home_pauze_bij_verblijf() from public, anon, authenticated;

drop trigger if exists stay_home_pauze on public.stay;
create trigger stay_home_pauze after insert or update of ended_at on public.stay
  for each row execute function public.home_pauze_bij_verblijf();


-- ---------------------------------------------------------------------
--  5. Actieve bewoners per dag (voor de factuur van een organisatie)
--
--  Een bewoner telt op elke dag waarop hij een open verblijf had, tot en
--  met de dag van het einde. Een overplaatsing (sluiten en op dezelfde dag
--  opnieuw openen) is één bewoner. Niet "app gebruikt": een WZC betaalt
--  niet minder wanneer een bewoner de app minder gebruikt.
-- ---------------------------------------------------------------------

create or replace function public.actieve_bewoners(org uuid, van date, tot date, tz text default 'Europe/Brussels')
returns table (dag date, aantal bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d::date, count(distinct y.household_id)
    from generate_series(van, tot, interval '1 day') d
    left join public.stay y
      on y.org_id = org
     and (y.started_at at time zone tz)::date <= d::date
     and (y.ended_at is null or (y.ended_at at time zone tz)::date >= d::date)
   where public.org_role_of(org) = 'org_admin'
      or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role'
      or auth.uid() is null
   group by d
   order by d;
$$;

revoke execute on function public.actieve_bewoners(uuid, date, date, text) from public, anon;
grant execute on function public.actieve_bewoners(uuid, date, date, text) to authenticated, service_role;
