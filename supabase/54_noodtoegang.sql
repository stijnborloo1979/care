-- =====================================================================
--  LIFEANGLE — noodtoegang voor een team lead
--  Supabase migratie, versie 54   (beslissing J8)
--
--  Draai dit na 53_org_zonder_inhoud.sql.
--  Terugdraaien: supabase/rollback/54_noodtoegang.sql
--  Tests: supabase/tests/test_54_noodtoegang.sql
--
--  Waarom
--  ------
--  Sinds 53 ziet een medewerker van een WZC alleen de bewoners aan wie hij
--  toegewezen is. 's Nachts of bij een val op een andere afdeling moet een
--  team lead toch snel weten wie de bewoner is, wie hij moet bellen en wat
--  er vandaag gepland stond. Dat is noodtoegang: kort, beperkt, met reden,
--  en altijd zichtbaar voor de familie.
--
--  De regels (J8)
--  --------------
--    Wie       alleen een team lead (department_staff) van dezelfde
--              organisatie als het open verblijf van de bewoner
--    Reden     verplicht, minstens 20 tekens
--    Duur      4 uur, niet verlengbaar
--    Wat       een vaste leesset: naam, voorkeuren, agenda (vandaag en
--              morgen), zorglogboek van de laatste 24 uur, contactpersonen.
--              Geen dagboek, verhalen, foto's, documenten, locatie,
--              medicatie of export.
--    Melding   meteen aan de familiebeheerder, via de bestaande weg
--              (melding met niveau 'alert': push, mail, WhatsApp, Telegram)
--    Stoppen   de starter, de org admin of de familiebeheerder
--    Grens     maximaal 3 starts per medewerker per 24 uur
--    Log       start, elke inzage, einde; niet te wijzigen of te wissen
--              via de app
--
--  Hoe
--  ---
--  Noodtoegang verandert GEEN enkele bestaande toegangsregel. De gegevens
--  komen alleen via de functie nood_inzage(), die bij elke oproep een
--  logregel schrijft. Zo is elke inzage gelogd zonder dat er iets aan de
--  RLS van agenda, logboek of contacten verandert.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.toegewezen(uuid)') is null then
    raise exception 'Draai eerst 53_org_zonder_inhoud.sql';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.emergency_access (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  stay_id       uuid not null references public.stay (id) on delete cascade,
  org_id        uuid not null references public.organisation (id) on delete cascade,
  profile_id    uuid not null references public.profile (id) on delete cascade,
  reason        text not null check (char_length(btrim(reason)) between 20 and 500),
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  ended_at      timestamptz,
  ended_by      uuid references public.profile (id) on delete set null,
  check (expires_at > started_at),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists emergency_access_hh_idx on public.emergency_access (household_id, started_at desc);
create index if not exists emergency_access_wie_idx on public.emergency_access (profile_id, started_at desc);
create index if not exists emergency_access_org_idx on public.emergency_access (org_id, started_at desc);

comment on table public.emergency_access is
  'Noodtoegang: een team lead kijkt 4 uur mee bij een bewoner van zijn organisatie die hem niet toegewezen is. Alleen te starten via start_noodtoegang().';

create table if not exists public.emergency_access_log (
  id            bigint generated always as identity primary key,
  access_id     uuid not null references public.emergency_access (id) on delete cascade,
  household_id  uuid not null references public.household (id) on delete cascade,
  actor_id      uuid references public.profile (id) on delete set null,
  action        text not null check (action in ('start', 'inzage', 'einde')),
  at            timestamptz not null default now()
);
create index if not exists emergency_access_log_access_idx on public.emergency_access_log (access_id, at);

comment on table public.emergency_access_log is
  'Wat er tijdens een noodtoegang gebeurde. Wordt alleen door de functies hieronder geschreven; niemand kan via de app wijzigen of wissen.';


-- ---------------------------------------------------------------------
--  2. Wie ziet de noodtoegang
--
--  De starter, de org admin, de familiebeheerder en de bewoner zelf.
--  Schrijven kan niemand rechtstreeks: geen insert-, update- of
--  delete-policy, en de rechten zijn ingetrokken.
-- ---------------------------------------------------------------------

alter table public.emergency_access     enable row level security;
alter table public.emergency_access_log enable row level security;

create or replace function public.mag_noodtoegang_zien(a_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.emergency_access a
     where a.id = a_id
       and (a.profile_id = auth.uid()
            or public.org_role_of(a.org_id) = 'org_admin'
            or public.family_role(a.household_id) = 'admin'
            or public.is_self(a.household_id))
  );
$$;

revoke execute on function public.mag_noodtoegang_zien(uuid) from public, anon;
grant execute on function public.mag_noodtoegang_zien(uuid) to authenticated, service_role;

drop policy if exists emergency_access_read on public.emergency_access;
create policy emergency_access_read on public.emergency_access for select
  using (public.mag_noodtoegang_zien(id));

drop policy if exists emergency_access_log_read on public.emergency_access_log;
create policy emergency_access_log_read on public.emergency_access_log for select
  using (public.mag_noodtoegang_zien(access_id));

revoke all on public.emergency_access, public.emergency_access_log from anon;
revoke insert, update, delete, truncate on public.emergency_access, public.emergency_access_log from authenticated;


-- ---------------------------------------------------------------------
--  3. Hulpfuncties
-- ---------------------------------------------------------------------

-- Is ik nu team lead op een afdeling van deze organisatie?
create or replace function public.is_team_lead_van(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.department_staff ds
      join public.department d on d.id = ds.department_id
      join public.org_membership om on om.org_id = d.org_id and om.profile_id = ds.profile_id
     where d.org_id = org
       and ds.profile_id = auth.uid()
       and ds.role = 'team_lead'
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

revoke execute on function public.is_team_lead_van(uuid) from public, anon;
grant execute on function public.is_team_lead_van(uuid) to authenticated, service_role;

-- De lopende noodtoegang van de oproeper, of null.
create or replace function public.actieve_noodtoegang(a_id uuid)
returns public.emergency_access
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from public.emergency_access a
    join public.stay s on s.id = a.stay_id
   where a.id = a_id
     and a.profile_id = auth.uid()
     and a.ended_at is null
     and a.expires_at > now()
     and s.ended_at is null
     and public.is_team_lead_van(a.org_id);
$$;

revoke execute on function public.actieve_noodtoegang(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  4. Starten
-- ---------------------------------------------------------------------

create or replace function public.start_noodtoegang(hh uuid, reden text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ik      uuid := auth.uid();
  s       public.stay;
  a_id    uuid;
  starts  integer;
  naam    text;
begin
  if ik is null then
    raise exception 'Niet aangemeld' using errcode = '42501';
  end if;

  reden := btrim(coalesce(reden, ''));
  if char_length(reden) < 20 then
    raise exception 'Geef een reden van minstens 20 tekens' using errcode = '22023';
  end if;
  if char_length(reden) > 500 then
    raise exception 'De reden mag hoogstens 500 tekens zijn' using errcode = '22023';
  end if;

  select * into s from public.stay where household_id = hh and ended_at is null;
  if s.id is null or not public.is_team_lead_van(s.org_id) then
    raise exception 'Deze bewoner verblijft niet in een organisatie waar jij team lead bent' using errcode = '42501';
  end if;

  if public.toegewezen(hh) or public.family_role(hh) is not null then
    raise exception 'Je hebt al gewone toegang tot deze bewoner' using errcode = '22023';
  end if;

  -- Eén start tegelijk per medewerker tellen, ook bij twee klikken na elkaar.
  perform pg_advisory_xact_lock(hashtextextended('noodtoegang:' || ik::text, 0));

  if exists (select 1 from public.emergency_access
              where profile_id = ik and household_id = hh
                and ended_at is null and expires_at > now()) then
    raise exception 'Je hebt al een lopende noodtoegang voor deze bewoner' using errcode = '22023';
  end if;

  select count(*) into starts from public.emergency_access
   where profile_id = ik and started_at > now() - interval '24 hours';
  if starts >= 3 then
    raise exception 'Je hebt de afgelopen 24 uur al 3 keer noodtoegang gestart' using errcode = '42501';
  end if;

  insert into public.emergency_access (household_id, stay_id, org_id, profile_id, reason, expires_at)
  values (hh, s.id, s.org_id, ik, reden, now() + interval '4 hours')
  returning id into a_id;

  insert into public.emergency_access_log (access_id, household_id, actor_id, action)
  values (a_id, hh, ik, 'start');

  select coalesce(nullif(btrim(p.full_name), ''), 'Een medewerker') into naam
    from public.profile p where p.id = ik;
  naam := coalesce(naam, 'Een medewerker');

  -- Via de bestaande weg: niveau 'alert' gaat met push, mail en de
  -- ingestelde kanalen naar de familiebeheerder.
  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'alert',
          format('Noodtoegang: %s (%s) kijkt 4 uur mee. Reden: %s',
                 naam, (select name from public.organisation where id = s.org_id), left(reden, 200)),
          'admin', 'noodtoegang:' || a_id::text);

  return a_id;
end;
$$;

revoke execute on function public.start_noodtoegang(uuid, text) from public, anon;
grant execute on function public.start_noodtoegang(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
--  5. Inzien — elke oproep wordt gelogd
-- ---------------------------------------------------------------------

create or replace function public.nood_inzage(a_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a   public.emergency_access;
  hh  uuid;
  tz  text;
begin
  a := public.actieve_noodtoegang(a_id);
  if a.id is null then
    raise exception 'Deze noodtoegang is niet (meer) actief' using errcode = '42501';
  end if;
  hh := a.household_id;

  insert into public.emergency_access_log (access_id, household_id, actor_id, action)
  values (a.id, hh, auth.uid(), 'inzage');

  select coalesce(timezone, 'Europe/Brussels') into tz from public.household where id = hh;

  return jsonb_build_object(
    'noodtoegang', jsonb_build_object('id', a.id, 'tot', a.expires_at),
    'bewoner', (select jsonb_build_object('naam', h.person_name, 'tijdzone', h.timezone)
                  from public.household h where h.id = hh),
    'voorkeuren', coalesce((
      select jsonb_agg(jsonb_build_object('titel', m.title, 'tekst', m.body) order by m.title)
        from public.memory_note m
       where m.household_id = hh and m.category = 'voorkeuren'), '[]'::jsonb),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('om', e.starts_at, 'titel', e.title, 'soort', e.kind,
                                          'gedaan', e.done_at is not null) order by e.starts_at)
        from public.agenda_event e
       where e.household_id = hh
         and e.starts_at >= (date_trunc('day', now() at time zone tz) at time zone tz)
         and e.starts_at <  (date_trunc('day', now() at time zone tz) at time zone tz) + interval '2 days'), '[]'::jsonb),
    'logboek', coalesce((
      select jsonb_agg(jsonb_build_object('om', c.occurred_at, 'titel', c.title, 'notitie', c.note)
                       order by c.occurred_at desc)
        from public.care_log c
       where c.household_id = hh and c.occurred_at > now() - interval '24 hours'), '[]'::jsonb),
    'contacten', coalesce((
      select jsonb_agg(jsonb_build_object('naam', p.name, 'relatie', p.relation, 'telefoon', p.phone)
                       order by p.sort, p.name)
        from public.person_card p
       where p.household_id = hh and p.kind in ('family', 'contact', 'care')), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.nood_inzage(uuid) from public, anon;
grant execute on function public.nood_inzage(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  6. Stoppen
-- ---------------------------------------------------------------------

create or replace function public.stop_noodtoegang(a_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.emergency_access;
begin
  select * into a from public.emergency_access where id = a_id;
  -- "is not true": een onbekende rol (null) telt als nee.
  if a.id is null
     or (a.profile_id = auth.uid()
         or public.org_role_of(a.org_id) = 'org_admin'
         or public.family_role(a.household_id) = 'admin') is not true then
    raise exception 'Je kan deze noodtoegang niet stoppen' using errcode = '42501';
  end if;
  if a.ended_at is not null or a.expires_at <= now() then
    return;   -- al voorbij; niets te doen
  end if;

  update public.emergency_access set ended_at = now(), ended_by = auth.uid() where id = a.id;
  insert into public.emergency_access_log (access_id, household_id, actor_id, action)
  values (a.id, a.household_id, auth.uid(), 'einde');
end;
$$;

revoke execute on function public.stop_noodtoegang(uuid) from public, anon;
grant execute on function public.stop_noodtoegang(uuid) to authenticated;
