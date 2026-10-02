-- =====================================================================
--  LIFEANGLE — wie las wat, wie veranderde wie mag
--  Supabase migratie, versie 55
--
--  Draai dit na 54_noodtoegang.sql.
--  Terugdraaien: supabase/rollback/55_leesaudit.sql
--  Tests: supabase/tests/test_55_audit.sql
--
--  Waarom
--  ------
--  Sinds 01 schrijft write_audit() wijzigingen aan documenten, medicatie,
--  lidmaatschappen en locatie-instellingen in audit_log. Wat ontbrak: wie
--  een document opende, een opname beluisterde of de locatie bekeek, en
--  alles wat over een organisatie gaat (verblijf, toewijzing, medewerkers).
--
--  Wat er gelogd wordt
--  -------------------
--  Inzage (alleen door iemand anders dan de bewoner zelf):
--    document openen           open_document()
--    opname van een verhaal    open_verhaal_opname()
--    laatste locatie bekijken  last_location()  (bestaand, logt nu ook)
--  Wijzigingen (nieuwe triggers, naast de bestaande uit 01):
--    lidmaatschap van de organisatie, afdelingsmedewerkers, toewijzingen,
--    verblijven
--
--  Lijsten, tellingen, achtergrondtaken en realtime loggen niet. Dezelfde
--  inzage door dezelfde persoon telt één keer per 10 minuten (locatie: per
--  30 minuten), zodat een scherm dat elke 5 minuten ververst de log niet
--  laat vollopen.
--
--  Wie leest de log
--  ----------------
--  De familiebeheerder (zoals voorheen, via audit.read): alles van zijn
--  huishouden. De org admin: alleen de wijzigingen die over zijn
--  organisatie gaan (verblijf, toewijzing, medewerkers), nooit wat familie
--  las. Schrijven kan niemand rechtstreeks.
--
--  Wat er aan bestaand gedrag verandert
--  ------------------------------------
--  Alleen last_location(): zelfde invoer, zelfde uitvoer, zelfde rechten
--  (security invoker, RLS beslist), maar schrijft nu een logregel. Zonder
--  deze migratie valt de app terug op de oude manier van documenten en
--  opnames openen.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. audit_log aanvullen
-- ---------------------------------------------------------------------

alter table public.audit_log add column if not exists org_id uuid;
alter table public.audit_log add column if not exists detail jsonb;
create index if not exists audit_log_hh_idx  on public.audit_log (household_id, at desc);
create index if not exists audit_log_org_idx on public.audit_log (org_id, at desc) where org_id is not null;
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, table_name, row_id, at desc);

comment on column public.audit_log.action is
  'inzage, of INSERT / UPDATE / DELETE voor een wijziging.';
comment on column public.audit_log.org_id is
  'Gezet wanneer de regel over een organisatie gaat (verblijf, toewijzing, medewerkers). Dan mag de org admin ze lezen.';

alter table public.audit_log enable row level security;

drop policy if exists audit_read_org on public.audit_log;
create policy audit_read_org on public.audit_log for select
  using (org_id is not null and public.org_role_of(org_id) = 'org_admin');

revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;


-- ---------------------------------------------------------------------
--  2. Een inzage loggen
--
--  Aanroepbaar door een aangemelde gebruiker, maar alleen voor een
--  huishouden waar hij een relatie mee heeft. Wie toegang heeft, kan in
--  het slechtste geval een inzage loggen die hij niet deed; wie geen
--  toegang heeft, kan niets loggen.
-- ---------------------------------------------------------------------

create or replace function public.audit_inzage(hh uuid, tabel text, rij uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  venster interval;
begin
  if auth.uid() is null or hh is null then
    return;
  end if;
  if tabel not in ('document', 'life_story', 'location_point') then
    raise exception 'Onbekende soort inzage: %', tabel using errcode = '22023';
  end if;
  -- De bewoner die haar eigen gegevens bekijkt, wordt niet gelogd.
  if public.is_self(hh) then
    return;
  end if;
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  venster := case tabel when 'location_point' then interval '30 minutes' else interval '10 minutes' end;
  if exists (
    select 1 from public.audit_log
     where actor_id = auth.uid() and table_name = tabel
       and row_id is not distinct from rij and household_id = hh
       and action = 'inzage' and at > now() - venster) then
    return;
  end if;

  insert into public.audit_log (household_id, actor_id, table_name, row_id, action, detail)
  values (hh, auth.uid(), tabel, rij, 'inzage',
          jsonb_build_object('rol', public.auth_role(hh)::text));
end;
$$;

revoke execute on function public.audit_inzage(uuid, text, uuid) from public, anon;
grant execute on function public.audit_inzage(uuid, text, uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  3. Openen via een functie die logt
--
--  security invoker: de bestaande RLS bepaalt of je de rij mag zien.
--  Zie je ze niet, dan krijg je een fout en wordt er niets gelogd.
--  De functie geeft het pad in de opslag terug; de app maakt daarmee,
--  zoals voorheen, een tijdelijke link.
-- ---------------------------------------------------------------------

create or replace function public.open_document(doc uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  d record;
begin
  select household_id, storage_path into d from public.document where id = doc;
  if not found then
    raise exception 'Document niet gevonden' using errcode = '42501';
  end if;
  perform public.audit_inzage(d.household_id, 'document', doc);
  return d.storage_path;
end;
$$;

revoke execute on function public.open_document(uuid) from public, anon;
grant execute on function public.open_document(uuid) to authenticated;

create or replace function public.open_verhaal_opname(verhaal uuid)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v record;
begin
  select household_id, audio_path into v from public.life_story where id = verhaal;
  if not found then
    raise exception 'Verhaal niet gevonden' using errcode = '42501';
  end if;
  perform public.audit_inzage(v.household_id, 'life_story', verhaal);
  return v.audio_path;
end;
$$;

revoke execute on function public.open_verhaal_opname(uuid) from public, anon;
grant execute on function public.open_verhaal_opname(uuid) to authenticated;

-- Bestaand (08): zelfde handtekening en uitvoer, logt nu ook. volatile
-- omdat de functie schrijft.
create or replace function public.last_location(hh uuid)
returns table (at timestamptz, lat double precision, lng double precision, inside_zone boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  r record;
begin
  select lp.at, lp.lat, lp.lng, lp.inside_zone into r
    from public.location_point lp
   where lp.household_id = hh
   order by lp.at desc
   limit 1;
  if not found then
    return;
  end if;
  perform public.audit_inzage(hh, 'location_point', null);
  at := r.at; lat := r.lat; lng := r.lng; inside_zone := r.inside_zone;
  return next;
end;
$$;

revoke execute on function public.last_location(uuid) from public, anon;
grant execute on function public.last_location(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  4. Wijzigingen in wie mag
-- ---------------------------------------------------------------------

create or replace function public.audit_wijziging()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       jsonb := to_jsonb(coalesce(new, old));
  hh      uuid;
  org     uuid;
  detail  jsonb;
begin
  case tg_table_name
    when 'org_membership' then
      org := (r ->> 'org_id')::uuid;
      detail := jsonb_build_object('profiel', r ->> 'profile_id', 'rol', r ->> 'role', 'actief', r -> 'active',
                                   'was', case when tg_op = 'UPDATE' then to_jsonb(old) ->> 'role' end);
    when 'department_staff' then
      select d.org_id into org from public.department d where d.id = (r ->> 'department_id')::uuid;
      if not found then return coalesce(new, old); end if;   -- afdeling wordt mee gewist
      detail := jsonb_build_object('profiel', r ->> 'profile_id', 'rol', r ->> 'role',
                                   'afdeling', r ->> 'department_id', 'tot', r ->> 'valid_until');
    when 'care_assignment' then
      select s.household_id, s.org_id into hh, org from public.stay s where s.id = (r ->> 'stay_id')::uuid;
      if not found then return coalesce(new, old); end if;   -- verblijf wordt mee gewist
      detail := jsonb_build_object('profiel', r ->> 'profile_id', 'van', r ->> 'valid_from', 'tot', r ->> 'valid_until');
    when 'stay' then
      hh := (r ->> 'household_id')::uuid;
      org := (r ->> 'org_id')::uuid;
      detail := jsonb_build_object('afdeling', r ->> 'department_id', 'kamer', r ->> 'room',
                                   'begin', r ->> 'started_at', 'einde', r ->> 'ended_at');
  end case;

  -- Een huishouden dat gewist wordt, neemt alles mee; daar hoort geen
  -- spoor van achter te blijven in de log.
  if tg_op = 'DELETE' and hh is not null
     and not exists (select 1 from public.household where id = hh) then
    return old;
  end if;
  if tg_op = 'DELETE' and org is not null
     and not exists (select 1 from public.organisation where id = org) then
    return old;
  end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;

  insert into public.audit_log (household_id, org_id, actor_id, table_name, row_id, action, detail)
  values (hh, org, auth.uid(), tg_table_name, (r ->> 'id')::uuid, tg_op, detail);
  return coalesce(new, old);
end;
$$;

revoke execute on function public.audit_wijziging() from public, anon, authenticated;

drop trigger if exists audit_org_membership on public.org_membership;
create trigger audit_org_membership after insert or update of role, active or delete on public.org_membership
  for each row execute function public.audit_wijziging();

drop trigger if exists audit_department_staff on public.department_staff;
create trigger audit_department_staff after insert or update or delete on public.department_staff
  for each row execute function public.audit_wijziging();

drop trigger if exists audit_care_assignment on public.care_assignment;
create trigger audit_care_assignment after insert or update or delete on public.care_assignment
  for each row execute function public.audit_wijziging();

drop trigger if exists audit_stay on public.stay;
create trigger audit_stay after insert or update or delete on public.stay
  for each row execute function public.audit_wijziging();
