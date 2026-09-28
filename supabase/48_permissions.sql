-- =====================================================================
--  LIFEANGLE — permissies als data
--  Supabase migratie, versie 48
--
--  Draai dit na 47_security_hotfix.sql.
--  Terugdraaien: supabase/rollback/48_permissions.sql
--
--  Waarom
--  ------
--  Wie wat mag, zit vandaag verspreid over 82 policies als vergelijkingen
--  van rollen. Deze migratie schrijft diezelfde regels op als data:
--
--    permission       de lijst van wat je kan doen (agenda.read, ...)
--    role_permission  welke relatie welke permissie heeft, en of daar
--                     toestemming voor nodig is
--    consent          wat de bewoner deelt, per categorie en per publiek
--    consent_history  elke wijziging, alleen toevoegen
--
--  BELANGRIJK: deze migratie verandert NIETS aan wie wat mag. Geen enkele
--  policy gebruikt deze tabellen al. Ze beschrijven de huidige regels
--  ("stelsel legacy"), en 49 bewijst met een pariteitstest dat ze exact
--  overeenkomen. Pas daarna worden policies omgezet (50, 51).
--
--  Legacy-relaties (zoals de code ze vandaag kent):
--    self        de persoon zelf (kaart "Dit ben jij" gekoppeld aan dit profiel)
--    admin       membership.role = 'admin'
--    member      membership.role = 'member'
--    caregiver   membership.role = 'caregiver'
--    person      membership.role = 'person' (de gekoppelde tablet)
--    org_member  geen membership, maar org_admin of coordinator van de
--                organisatie waaraan het huishouden gekoppeld is
--                (wat auth_role() vandaag als 'member' behandelt)
--
--  De huidige ondersteuningsfasen worden toestemming:
--    categorie 'meekijken'   (logboek, medicatie-inname, locatie, notities)
--                            gegeven aan publiek 'leden' bij samen/ondersteund
--    categorie 'notities'    (Onthoud dit) volgt household.share_quick_notes
--  Een trigger houdt consent gelijk met household, zolang de app die
--  kolommen nog zelf zet.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.permission (
  key                 text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description         text not null,
  -- Van wie is de data waar deze permissie over gaat? Beleid van een
  -- organisatie mag nooit gelden voor data van de bewoner.
  owner               text not null default 'resident'
                        check (owner in ('resident', 'organisation', 'platform')),
  -- Alle categorieën moeten gedeeld zijn als needs_consent aan staat.
  consent_categories  text[] not null default '{}',
  -- Een menselijke read hierop wordt later gelogd (migratie 55).
  sensitive_read      boolean not null default false
);

create table if not exists public.role_permission (
  stelsel            text not null default 'legacy' check (stelsel in ('legacy', 'v2')),
  relation           text not null,
  permission_key     text not null references public.permission (key) on delete cascade,
  scope              text not null default 'all' check (scope in ('all', 'own', 'assigned')),
  needs_entitlement  boolean not null default false,
  needs_consent      boolean not null default false,
  needs_policy       boolean not null default false,
  -- Leeg = de categorieën van de permissie. Zelden nodig: de tablet
  -- kijkt altijd mee, maar notities volgen ook voor hem de keuze.
  consent_categories text[],
  primary key (stelsel, relation, permission_key)
);

create table if not exists public.consent (
  household_id  uuid not null references public.household (id) on delete cascade,
  category      text not null,
  audience      text not null check (audience in ('leden', 'family', 'care_team')),
  granted       boolean not null,
  granted_by    uuid references public.profile (id) on delete set null,
  basis         text not null default 'legacy_support_level',
  updated_at    timestamptz not null default now(),
  primary key (household_id, category, audience)
);

create table if not exists public.consent_history (
  id            bigint generated always as identity primary key,
  household_id  uuid not null references public.household (id) on delete cascade,
  category      text not null,
  audience      text not null,
  granted       boolean not null,
  changed_by    uuid,
  basis         text,
  at            timestamptz not null default now()
);

create index if not exists consent_history_hh_idx on public.consent_history (household_id, at desc);


-- ---------------------------------------------------------------------
--  2. Wie mag deze tabellen zien
--
--  permission en role_permission zijn geen geheim: de app leest ze om
--  menu's te tonen. Schrijven kan alleen via migraties.
--  consent: leesbaar voor wie bij het huishouden hoort; schrijven alleen
--  via de trigger hieronder (en later een RPC).
-- ---------------------------------------------------------------------

alter table public.permission      enable row level security;
alter table public.role_permission enable row level security;
alter table public.consent         enable row level security;
alter table public.consent_history enable row level security;

drop policy if exists permission_read on public.permission;
create policy permission_read on public.permission for select to authenticated using (true);

drop policy if exists role_permission_read on public.role_permission;
create policy role_permission_read on public.role_permission for select to authenticated using (true);

drop policy if exists consent_read on public.consent;
create policy consent_read on public.consent for select using (public.is_member(household_id));

drop policy if exists consent_history_read on public.consent_history;
create policy consent_history_read on public.consent_history for select
  using (public.is_self(household_id) or public.family_role(household_id) = 'admin');

revoke insert, update, delete on public.permission, public.role_permission,
  public.consent, public.consent_history from anon, authenticated;
revoke all on public.permission, public.role_permission, public.consent,
  public.consent_history from anon;


-- ---------------------------------------------------------------------
--  3. De permissies van vandaag
--
--  Elke sleutel hoort bij één uitdrukking in een bestaande policy. De
--  pariteitstest (tests/test_49_parity.sql) legt die koppeling vast.
-- ---------------------------------------------------------------------

insert into public.permission (key, description, owner, consent_categories, sensitive_read) values
  -- is_member()
  ('household.read',        'Het huishouden zien',                          'resident', '{}', false),
  ('agenda.read',           'Agenda lezen',                                 'resident', '{}', false),
  ('people.read',           'Wie is wie lezen',                             'resident', '{}', false),
  ('routine.read',          'Routines lezen',                               'resident', '{}', false),
  ('notes.read',            'Weetjes (Memory Bank) lezen',                  'resident', '{}', false),
  ('memories.read',         'Foto''s en herinneringen bekijken',            'resident', '{}', false),
  ('medication.read',       'Medicatieschema lezen',                        'resident', '{}', false),
  ('diary.read',            'Verhalen en dagboek lezen (als gedeeld)',      'resident', '{}', true),
  ('call.read',             'Gesprekken zien',                              'resident', '{}', false),
  ('location_setting.read', 'Locatie-instelling zien',                      'resident', '{}', false),
  ('radio.read',            'Radiozenders zien',                            'resident', '{}', false),
  ('shopping.read',         'Boodschappenlijst lezen',                      'resident', '{}', false),
  ('voice_action.read',     'Uitgevoerde spraakacties zien',                'resident', '{}', false),
  ('notification.read',     'Meldingen zien',                               'resident', '{}', false),
  ('membership.read',       'Leden van het huishouden zien',                'resident', '{}', false),
  ('consent.read',          'Toestemmingen zien',                           'resident', '{}', false),
  ('files.memories.read',   'Foto''s en avatars downloaden',                'resident', '{}', false),
  -- auth_role in (admin, member)
  ('agenda.write',          'Agenda plannen en wijzigen',                   'resident', '{}', false),
  ('people.write',          'Wie is wie beheren',                           'resident', '{}', false),
  ('routine.write',         'Routines beheren',                             'resident', '{}', false),
  ('notes.write',           'Weetjes beheren',                              'resident', '{}', false),
  ('memories.write',        'Foto''s en herinneringen beheren',             'resident', '{}', false),
  ('medication.write',      'Medicatieschema beheren',                      'resident', '{}', false),
  ('radio.write',           'Radiozenders beheren',                         'resident', '{}', false),
  ('task.manage',           'Familietaken',                                 'resident', '{}', false),
  ('device.read',           'Gekoppelde toestellen zien',                   'resident', '{}', false),
  ('notification_delivery.read', 'Aflevering van meldingen zien',           'resident', '{}', false),
  ('files.memories.write',  'Foto''s en avatars uploaden en wissen',        'resident', '{}', false),
  -- auth_role = admin
  ('household.write',       'Instellingen van het huishouden wijzigen',     'resident', '{}', false),
  ('membership.manage',     'Leden en rollen beheren',                      'resident', '{}', false),
  ('location_setting.write','Locatie aan- of uitzetten',                    'resident', '{}', false),
  ('care_log.delete',       'Logboekregels wissen',                         'resident', '{}', false),
  ('diary.delete_any',      'Elk verhaal wissen',                           'resident', '{}', false),
  ('quick_note.delete_any', 'Elke notitie wissen',                          'resident', '{}', false),
  -- auth_role in (admin, member, person)
  ('diary.write',           'Een verhaal of dagboekfragment toevoegen',     'resident', '{}', false),
  ('quick_note.write',      'Onthoud dit: notitie toevoegen',               'resident', '{}', false),
  ('shopping.write',        'Boodschappen toevoegen en afvinken',           'resident', '{}', false),
  -- auth_role in (admin, member, caregiver)
  ('care_log.write',        'Logboekregel toevoegen',                       'resident', '{}', false),
  -- auth_role = caregiver
  ('agenda.write_own',      'Eigen afspraken plannen (zorgverlener)',       'resident', '{}', false),
  -- family_role in (admin, member)
  ('document.read',         'Documenten lezen en downloaden',               'resident', '{}', true),
  ('message.family.read',   'Familiedraad lezen',                           'resident', '{}', false),
  ('message.family.write',  'In de familiedraad schrijven',                 'resident', '{}', false),
  ('files.messages.family', 'Bestanden in de familiedraad',                 'resident', '{}', false),
  -- family_role = admin
  ('document.write',        'Documenten beheren',                           'resident', '{}', false),
  ('audit.read',            'Het auditlog lezen',                           'resident', '{}', false),
  ('invitation.manage',     'Uitnodigingen beheren',                        'resident', '{}', false),
  ('message.moderate',      'Berichten van anderen wissen',                 'resident', '{}', false),
  -- family_role in (admin, member, person)
  ('message.resident.send', 'Een bericht aan de bewoner sturen',            'resident', '{}', false),
  ('files.messages.read',   'Spraakberichten en foto''s aan de bewoner',    'resident', '{}', false),
  -- family_role = person
  ('message.resident.read', 'Berichten aan de bewoner lezen (als bewoner)', 'resident', '{}', false),
  -- mag_meekijken()
  ('care_log.read',         'Logboek lezen',                                'resident', '{meekijken}', true),
  ('medication_log.read',   'Medicatie-inname lezen',                       'resident', '{meekijken}', false),
  ('location.read',         'Locatiegeschiedenis lezen',                    'resident', '{meekijken}', true),
  -- quick_note_read: zelf, of meekijken én notities gedeeld
  ('quick_note.read',       'Onthoud dit: notities lezen',                  'resident', '{meekijken,notities}', true)
on conflict (key) do update
  set description = excluded.description,
      owner = excluded.owner,
      consent_categories = excluded.consent_categories,
      sensitive_read = excluded.sensitive_read;


-- ---------------------------------------------------------------------
--  4. Legacy-rechten per relatie
-- ---------------------------------------------------------------------

delete from public.role_permission where stelsel = 'legacy';

-- Hulpje binnen deze migratie: een groep permissies voor een groep relaties.
create or replace function pg_temp.geef(relaties text[], sleutels text[], toestemming boolean default false)
returns void language sql as $$
  insert into public.role_permission (stelsel, relation, permission_key, needs_consent)
  select 'legacy', r, k, toestemming
    from unnest(relaties) r, unnest(sleutels) k
  on conflict (stelsel, relation, permission_key) do update set needs_consent = excluded.needs_consent;
$$;

-- is_member(): elke rol, ook via de organisatie
select pg_temp.geef(
  array['admin', 'member', 'caregiver', 'person', 'org_member'],
  array['household.read', 'agenda.read', 'people.read', 'routine.read', 'notes.read',
        'memories.read', 'medication.read', 'diary.read', 'call.read', 'location_setting.read',
        'radio.read', 'shopping.read', 'voice_action.read', 'notification.read',
        'membership.read', 'consent.read', 'files.memories.read']);

-- auth_role() in (admin, member)
select pg_temp.geef(
  array['admin', 'member', 'org_member'],
  array['agenda.write', 'people.write', 'routine.write', 'notes.write', 'memories.write',
        'medication.write', 'radio.write', 'task.manage', 'device.read',
        'notification_delivery.read', 'files.memories.write']);

-- auth_role() = admin (een organisatie is nooit admin)
select pg_temp.geef(
  array['admin'],
  array['household.write', 'membership.manage', 'location_setting.write', 'care_log.delete',
        'diary.delete_any', 'quick_note.delete_any']);

-- auth_role() in (admin, member, person)
select pg_temp.geef(
  array['admin', 'member', 'person', 'org_member'],
  array['diary.write', 'quick_note.write', 'shopping.write']);

-- auth_role() in (admin, member, caregiver)
select pg_temp.geef(array['admin', 'member', 'caregiver', 'org_member'], array['care_log.write']);

-- auth_role() = caregiver
select pg_temp.geef(array['caregiver'], array['agenda.write_own']);

-- family_role(): de organisatie telt niet mee
select pg_temp.geef(array['admin', 'member'],
  array['document.read', 'message.family.read', 'message.family.write', 'files.messages.family']);
select pg_temp.geef(array['admin'],
  array['document.write', 'audit.read', 'invitation.manage', 'message.moderate']);
select pg_temp.geef(array['admin', 'member', 'person'],
  array['message.resident.send', 'files.messages.read']);
select pg_temp.geef(array['person'], array['message.resident.read']);

-- mag_meekijken(): de persoon zelf en de tablet altijd, de rest met toestemming
select pg_temp.geef(array['self', 'person'],
  array['care_log.read', 'medication_log.read', 'location.read']);
select pg_temp.geef(array['admin', 'member', 'caregiver', 'org_member'],
  array['care_log.read', 'medication_log.read', 'location.read'], true);

-- quick_note_read: zelf altijd; anderen als meekijken én notities gedeeld
select pg_temp.geef(array['self'], array['quick_note.read']);
select pg_temp.geef(array['admin', 'member', 'caregiver', 'org_member'],
  array['quick_note.read'], true);
-- De tablet kijkt altijd mee (mag_meekijken), dus voor hem telt alleen of
-- notities gedeeld worden.
insert into public.role_permission (stelsel, relation, permission_key, needs_consent, consent_categories)
values ('legacy', 'person', 'quick_note.read', true, '{notities}')
on conflict (stelsel, relation, permission_key) do update
  set needs_consent = true, consent_categories = excluded.consent_categories;


-- ---------------------------------------------------------------------
--  5. Toestemming volgt de huidige kolommen van household
-- ---------------------------------------------------------------------

create or replace function public.consent_sync_from_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.consent (household_id, category, audience, granted, granted_by, basis, updated_at)
  values
    (new.id, 'meekijken', 'leden', new.support_level in ('samen', 'ondersteund'),
     auth.uid(), 'legacy_support_level', now()),
    (new.id, 'notities', 'leden', coalesce(new.share_quick_notes, true),
     auth.uid(), 'legacy_share_quick_notes', now())
  on conflict (household_id, category, audience) do update
    set granted = excluded.granted,
        granted_by = excluded.granted_by,
        basis = excluded.basis,
        updated_at = excluded.updated_at
    where public.consent.granted is distinct from excluded.granted;
  return new;
end;
$$;

create or replace function public.consent_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.consent_history (household_id, category, audience, granted, changed_by, basis)
  values (new.household_id, new.category, new.audience, new.granted, new.granted_by, new.basis);
  return new;
end;
$$;

revoke execute on function public.consent_sync_from_household() from public, anon, authenticated;
revoke execute on function public.consent_log_change() from public, anon, authenticated;

drop trigger if exists consent_history_log on public.consent;
create trigger consent_history_log
  after insert or update of granted on public.consent
  for each row execute function public.consent_log_change();

drop trigger if exists household_consent_sync on public.household;
create trigger household_consent_sync
  after insert or update of support_level, share_quick_notes on public.household
  for each row execute function public.consent_sync_from_household();

-- Bestaande huishoudens meteen invullen.
insert into public.consent (household_id, category, audience, granted, basis)
select h.id, 'meekijken', 'leden', h.support_level in ('samen', 'ondersteund'), 'legacy_support_level'
  from public.household h
on conflict do nothing;
insert into public.consent (household_id, category, audience, granted, basis)
select h.id, 'notities', 'leden', coalesce(h.share_quick_notes, true), 'legacy_share_quick_notes'
  from public.household h
on conflict do nothing;
