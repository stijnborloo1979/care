-- =====================================================================
--  LIFEANGLE Care — zorgnotities, overdracht en activiteiten
--  Supabase migratie, versie 59
--
--  Draai dit na 58_abonnementen.sql.
--  Terugdraaien: supabase/rollback/59_zorg.sql
--  Tests: supabase/tests/test_59_zorg.sql
--
--  Nieuw, raakt niets bestaands
--  ----------------------------
--  care_log blijft het logboek van Home. Care krijgt eigen tabellen:
--
--    care_note             observaties van het zorgteam over één bewoner,
--                          tijdens één verblijf
--    handover              de overdracht van een dienst, per afdeling
--    activity              activiteiten van een organisatie of afdeling
--    activity_participant  wie aan een activiteit deelneemt
--
--  Wie mag wat
--  -----------
--  care_note
--    schrijven  wie de bewoner toegewezen kreeg, of de team lead van haar
--               afdeling (toegewezen(), 53), tijdens het open verblijf
--    lezen      hetzelfde team, alle notities van die organisatie over
--               deze bewoner; familie (met toestemming om mee te kijken)
--               en de bewoner zelf alleen notities gemarkeerd "familie"
--    nooit      de org admin (J4), en niemand past een notitie aan of
--               wist ze via de app: een correctie is een nieuwe notitie
--               die naar de oude verwijst
--    bewaren    een notitie krijgt bij het einde van het verblijf een
--               bewaartermijn van 2 jaar (voorstel J11, nog te beslissen);
--               ze blijft bij de organisatie, de familie houdt haar
--               eigen Home-gegevens
--  handover     medewerkers en team leads van de afdeling
--  activity     lezen: medewerkers van de organisatie, bewoners met een
--               open verblijf en hun familie; beheren: org admin,
--               coördinator, team lead
--  deelname     inschrijven: wie een relatie heeft met de bewoner (team,
--               bewoner, familiebeheerder), en alleen bij een open
--               verblijf in die organisatie
--
--  Abonnementen (58) worden hier nog niet afgedwongen.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.toegewezen(uuid)') is null then
    raise exception 'Draai eerst 53_org_zonder_inhoud.sql';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  1. Zorgnotities
-- ---------------------------------------------------------------------

create table if not exists public.care_note (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.household (id) on delete cascade,
  stay_id          uuid not null references public.stay (id) on delete cascade,
  org_id           uuid not null references public.organisation (id) on delete cascade,
  category         text not null default 'observatie'
                     check (category in ('observatie', 'zorg', 'maaltijd', 'slaap', 'stemming', 'incident', 'overig')),
  body             text not null check (char_length(btrim(body)) between 1 and 4000),
  visibility       text not null default 'team' check (visibility in ('team', 'familie')),
  vervangt         uuid references public.care_note (id) on delete set null,
  author_id        uuid references public.profile (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  retention_until  timestamptz
);
create index if not exists care_note_hh_idx on public.care_note (household_id, created_at desc);
create index if not exists care_note_bewaar_idx on public.care_note (retention_until) where retention_until is not null;

comment on table public.care_note is
  'Observaties van het zorgteam (Care). Los van care_log (Home). Niet aan te passen of te wissen via de app; een correctie is een nieuwe notitie met vervangt.';

-- Het verblijf en de organisatie komen altijd van het open verblijf, nooit
-- van de app. De auteur is altijd wie schrijft.
create or replace function public.care_note_vul()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stay;
begin
  select * into s from public.stay where household_id = new.household_id and ended_at is null;
  if s.id is null then
    raise exception 'Deze bewoner heeft geen lopend verblijf' using errcode = '42501';
  end if;
  new.stay_id := s.id;
  new.org_id := s.org_id;
  new.author_id := auth.uid();
  new.created_at := now();
  new.retention_until := null;
  if new.vervangt is not null and not exists (
       select 1 from public.care_note where id = new.vervangt and household_id = new.household_id) then
    raise exception 'Een correctie hoort bij dezelfde bewoner' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.care_note_vul() from public, anon, authenticated;

drop trigger if exists care_note_vul on public.care_note;
create trigger care_note_vul before insert on public.care_note
  for each row execute function public.care_note_vul();

alter table public.care_note enable row level security;

-- De organisatie van het open verblijf (of null).
create or replace function public.huidige_org(hh uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.stay where household_id = hh and ended_at is null;
$$;

revoke execute on function public.huidige_org(uuid) from public, anon;
grant execute on function public.huidige_org(uuid) to authenticated, service_role;

drop policy if exists care_note_team_read on public.care_note;
create policy care_note_team_read on public.care_note for select
  using (public.toegewezen(household_id) and org_id = public.huidige_org(household_id));

drop policy if exists care_note_familie_read on public.care_note;
create policy care_note_familie_read on public.care_note for select
  using (
    visibility = 'familie'
    and (public.is_self(household_id)
         or (public.family_role(household_id) in ('admin', 'member')
             and public.can_legacy(household_id, 'care_log.read')))
  );

drop policy if exists care_note_insert on public.care_note;
create policy care_note_insert on public.care_note for insert
  with check (public.toegewezen(household_id));

revoke all on public.care_note from anon;
revoke update, delete, truncate on public.care_note from authenticated;

-- Bewaartermijn: bij het einde van het verblijf.
create or replace function public.care_note_bewaartermijn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    update public.care_note
       set retention_until = new.ended_at + interval '2 years'
     where stay_id = new.id and retention_until is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.care_note_bewaartermijn() from public, anon, authenticated;

drop trigger if exists stay_care_note_bewaren on public.stay;
create trigger stay_care_note_bewaren after update of ended_at on public.stay
  for each row execute function public.care_note_bewaartermijn();

-- Opruimen na de bewaartermijn. Alleen voor de server; inplannen gebeurt
-- apart, na de beslissing over de termijn (J11).
create or replace function public.care_note_opruimen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.care_note where retention_until is not null and retention_until < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.care_note_opruimen() from public, anon, authenticated;
grant execute on function public.care_note_opruimen() to service_role;


-- ---------------------------------------------------------------------
--  2. Overdracht per afdeling
-- ---------------------------------------------------------------------

create table if not exists public.handover (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.department (id) on delete cascade,
  shift_date     date not null,
  shift          text not null check (shift in ('vroeg', 'laat', 'nacht')),
  body           text not null check (char_length(btrim(body)) between 1 and 8000),
  author_id      uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists handover_dept_idx on public.handover (department_id, shift_date desc);

create or replace function public.werkt_op_afdeling(dep uuid)
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
     where ds.department_id = dep
       and ds.profile_id = auth.uid()
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

revoke execute on function public.werkt_op_afdeling(uuid) from public, anon;
grant execute on function public.werkt_op_afdeling(uuid) to authenticated, service_role;

alter table public.handover enable row level security;

drop policy if exists handover_read on public.handover;
create policy handover_read on public.handover for select
  using (public.werkt_op_afdeling(department_id));

drop policy if exists handover_insert on public.handover;
create policy handover_insert on public.handover for insert
  with check (public.werkt_op_afdeling(department_id) and author_id = auth.uid());

revoke all on public.handover from anon;
revoke update, delete, truncate on public.handover from authenticated;


-- ---------------------------------------------------------------------
--  3. Activiteiten
-- ---------------------------------------------------------------------

create table if not exists public.activity (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisation (id) on delete cascade,
  department_id  uuid references public.department (id) on delete cascade,
  titel          text not null check (char_length(btrim(titel)) between 1 and 120),
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  plaats         text,
  status         text not null default 'gepland' check (status in ('gepland', 'geannuleerd', 'afgelopen')),
  created_by     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists activity_org_idx on public.activity (org_id, starts_at);

create table if not exists public.activity_participant (
  activity_id   uuid not null references public.activity (id) on delete cascade,
  household_id  uuid not null references public.household (id) on delete cascade,
  status        text not null default 'ingeschreven' check (status in ('ingeschreven', 'aanwezig', 'afwezig')),
  created_by    uuid references public.profile (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  primary key (activity_id, household_id)
);

-- Woont deze bewoner nu in deze organisatie?
create or replace function public.woont_in(hh uuid, org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.stay where household_id = hh and org_id = org and ended_at is null);
$$;

revoke execute on function public.woont_in(uuid, uuid) from public, anon;
grant execute on function public.woont_in(uuid, uuid) to authenticated, service_role;

-- Mag ik activiteiten van deze organisatie beheren?
create or replace function public.beheert_activiteiten(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(org) in ('org_admin', 'coordinator')
      or public.is_team_lead_van(org);
$$;

revoke execute on function public.beheert_activiteiten(uuid) from public, anon;
grant execute on function public.beheert_activiteiten(uuid) to authenticated, service_role;

-- Woont iemand met wie ik een relatie heb in deze organisatie?
create or replace function public.ziet_activiteiten_van(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_staff(org)
      or exists (
        select 1 from public.stay s
         where s.org_id = org and s.ended_at is null
           and (public.is_self(s.household_id) or public.family_role(s.household_id) is not null));
$$;

revoke execute on function public.ziet_activiteiten_van(uuid) from public, anon;
grant execute on function public.ziet_activiteiten_van(uuid) to authenticated, service_role;

alter table public.activity enable row level security;
alter table public.activity_participant enable row level security;

drop policy if exists activity_read on public.activity;
create policy activity_read on public.activity for select
  using (public.ziet_activiteiten_van(org_id));

drop policy if exists activity_write on public.activity;
create policy activity_write on public.activity for all
  using (public.beheert_activiteiten(org_id))
  with check (public.beheert_activiteiten(org_id));

-- Deelname: het team van de organisatie ziet de lijst; de bewoner en haar
-- familie zien alleen hun eigen deelname.
drop policy if exists participant_read on public.activity_participant;
create policy participant_read on public.activity_participant for select
  using (
    public.is_self(household_id)
    or public.family_role(household_id) is not null
    or exists (select 1 from public.activity a where a.id = activity_id and public.is_org_staff(a.org_id))
  );

-- Inschrijven: alleen bij een open verblijf in die organisatie, en alleen
-- wie een relatie heeft met de bewoner.
drop policy if exists participant_write on public.activity_participant;
create policy participant_write on public.activity_participant for insert
  with check (
    exists (select 1 from public.activity a
             where a.id = activity_id and a.status = 'gepland'
               and public.woont_in(household_id, a.org_id))
    and (public.toegewezen(household_id)
         or public.is_self(household_id)
         or public.family_role(household_id) = 'admin')
  );

-- Aanwezigheid aanduiden: het team.
drop policy if exists participant_update on public.activity_participant;
create policy participant_update on public.activity_participant for update
  using (public.toegewezen(household_id))
  with check (public.toegewezen(household_id));

-- Uitschrijven: wie mocht inschrijven.
drop policy if exists participant_delete on public.activity_participant;
create policy participant_delete on public.activity_participant for delete
  using (public.toegewezen(household_id) or public.is_self(household_id) or public.family_role(household_id) = 'admin');

revoke all on public.activity, public.activity_participant from anon;


-- ---------------------------------------------------------------------
--  4. Noodtoegang (54) leest ook de zorgnotities van de laatste 24 uur
--
--  Zelfde functie als in 54, met één sleutel erbij: 'zorgnotities'.
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
    'zorgnotities', coalesce((
      select jsonb_agg(jsonb_build_object('om', n.created_at, 'soort', n.category, 'tekst', n.body)
                       order by n.created_at desc)
        from public.care_note n
       where n.household_id = hh and n.org_id = a.org_id
         and n.created_at > now() - interval '24 hours'), '[]'::jsonb),
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
