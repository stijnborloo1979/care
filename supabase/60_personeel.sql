-- =====================================================================
--  LIFEANGLE Care — wat de schermen voor een woonzorgcentrum nodig hebben
--  Supabase migratie, versie 60
--
--  Draai dit na 59_zorg.sql.
--  Terugdraaien: supabase/rollback/60_personeel.sql
--  Tests: supabase/tests/test_60_personeel.sql
--
--  Alleen nieuwe functies, één nieuwe tabel (org_invitation) en één
--  nieuwe kolom (organisation.koppelcode). Geen bestaande regel verandert.
--
--    mijn_organisaties()            waar werk ik, in welke rol, op welke afdeling
--    mijn_bewoners(org)             de bewoners die ik volg (toegewezen of team lead)
--    org_medewerkers(org)           collega's met naam; e-mail alleen voor de org admin
--    wijs_toe(hh, profiel)          een medewerker toewijzen aan een bewoner
--    stop_toewijzing(id)            een toewijzing beëindigen
--    zet_verblijf(hh, afd, kamer)   afdeling en kamer van een bewoner
--    nodig_medewerker_uit(...)      uitnodiging voor een medewerker (link)
--    org_uitnodiging_bekijk(token)  wat staat er in deze uitnodiging
--    aanvaard_org_uitnodiging(t)    uitnodiging aanvaarden (zelfde e-mail)
--    org_koppelcode(org)            de code die familie nodig heeft
--    nieuwe_koppelcode(org)         een nieuwe code (de oude werkt niet meer)
--    koppel_met_wzc(hh, code)       familiebeheerder koppelt het huishouden
--    mijn_wzc(hh)                   naam van het WZC, voor de familie
--
--  Toewijzen mogen de org admin, de coördinator en de team lead van de
--  afdeling van de bewoner. Dat volgt assign_caregiver() uit 03.
-- =====================================================================

do $$
begin
  if to_regclass('public.care_note') is null then
    raise exception 'Draai eerst 59_zorg.sql';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  1. Koppelcode van een organisatie
-- ---------------------------------------------------------------------

create or replace function public.genereer_koppelcode()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  tekens constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  uit text := '';
begin
  for i in 0..7 loop
    uit := uit || substr(tekens, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return uit;
end;
$$;

revoke execute on function public.genereer_koppelcode() from public, anon, authenticated;

alter table public.organisation add column if not exists koppelcode text;
update public.organisation set koppelcode = public.genereer_koppelcode() where koppelcode is null;
alter table public.organisation alter column koppelcode set default public.genereer_koppelcode();
create unique index if not exists organisation_koppelcode_idx on public.organisation (koppelcode);

comment on column public.organisation.koppelcode is
  'De code die het WZC aan familie geeft. Met die code koppelt de familiebeheerder zelf het huishouden; een WZC kan nooit zelf een bewoner toevoegen.';

create or replace function public.org_koppelcode(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select koppelcode from public.organisation
   where id = org and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

create or replace function public.nieuwe_koppelcode(org uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c text;
begin
  if public.org_role_of(org) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  update public.organisation set koppelcode = public.genereer_koppelcode() where id = org returning koppelcode into c;
  return c;
end;
$$;

create or replace function public.koppel_met_wzc(hh uuid, code text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.organisation;
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan een huishouden koppelen' using errcode = '42501';
  end if;
  select * into o from public.organisation
   where koppelcode = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) and active;
  if o.id is null then
    raise exception 'Deze code kennen we niet. Kijk ze na of vraag ze opnieuw aan het woonzorgcentrum.' using errcode = '22023';
  end if;
  perform public.link_household_to_org(hh, o.id);
  return o.name;
end;
$$;

create or replace function public.mijn_wzc(hh uuid)
returns table (org_id uuid, naam text, sinds timestamptz, afdeling text, kamer text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, coalesce(s.started_at, h.org_linked_at), d.name, s.room
    from public.household h
    join public.organisation o on o.id = h.org_id
    left join public.stay s on s.household_id = h.id and s.ended_at is null
    left join public.department d on d.id = s.department_id
   where h.id = hh
     and (public.family_role(hh) is not null or public.is_self(hh));
$$;


-- ---------------------------------------------------------------------
--  2. Waar werk ik, wie volg ik, wie zijn mijn collega's
-- ---------------------------------------------------------------------

create or replace function public.mijn_organisaties()
returns table (org_id uuid, naam text, rol text, team_lead boolean, afdelingen jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, om.role::text,
         public.is_team_lead_van(o.id),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', d.id, 'naam', d.name, 'rol', ds.role) order by d.name)
             from public.department_staff ds
             join public.department d on d.id = ds.department_id
            where d.org_id = o.id and ds.profile_id = auth.uid()
              and ds.valid_from <= now() and (ds.valid_until is null or ds.valid_until > now())), '[]'::jsonb)
    from public.org_membership om
    join public.organisation o on o.id = om.org_id
   where om.profile_id = auth.uid() and om.active and o.active
   order by o.name;
$$;

create or replace function public.mijn_bewoners(org uuid)
returns table (household_id uuid, naam text, afdeling text, kamer text, via text)
language sql
stable
security definer
set search_path = public
as $$
  select s.household_id, h.person_name, d.name, s.room,
         case when exists (
                select 1 from public.care_assignment ca
                 where ca.stay_id = s.id and ca.profile_id = auth.uid()
                   and ca.valid_from <= now() and (ca.valid_until is null or ca.valid_until > now()))
              then 'toegewezen' else 'afdeling' end
    from public.stay s
    join public.household h on h.id = s.household_id
    left join public.department d on d.id = s.department_id
   where s.org_id = org and s.ended_at is null
     and public.toegewezen(s.household_id)
   order by h.person_name;
$$;

create or replace function public.org_medewerkers(org uuid)
returns table (profile_id uuid, naam text, email text, rol text, actief boolean, afdelingen jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select om.profile_id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1), 'Medewerker'),
         case when public.org_role_of(org) = 'org_admin' then u.email::text end,
         om.role::text, om.active,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', d.id, 'naam', d.name, 'rol', ds.role, 'rij', ds.id) order by d.name)
             from public.department_staff ds
             join public.department d on d.id = ds.department_id
            where d.org_id = org and ds.profile_id = om.profile_id
              and ds.valid_from <= now() and (ds.valid_until is null or ds.valid_until > now())), '[]'::jsonb)
    from public.org_membership om
    left join public.profile p on p.id = om.profile_id
    left join auth.users u on u.id = om.profile_id
   where om.org_id = org and public.is_org_staff(org)
   order by om.active desc, 2;
$$;


-- ---------------------------------------------------------------------
--  3. Toewijzen en verblijf
-- ---------------------------------------------------------------------

-- Mag ik toewijzingen en het verblijf van deze bewoner beheren?
create or replace function public.mag_toewijzen(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stay s
     where s.household_id = hh and s.ended_at is null
       and (coalesce(public.org_role_of(s.org_id)::text, '') in ('org_admin', 'coordinator')
            or exists (
              select 1 from public.department_staff ds
               where ds.department_id = s.department_id and ds.profile_id = auth.uid()
                 and ds.role = 'team_lead' and ds.valid_from <= now()
                 and (ds.valid_until is null or ds.valid_until > now()))));
$$;

create or replace function public.wijs_toe(hh uuid, profiel uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s  public.stay;
  id uuid;
begin
  if not public.mag_toewijzen(hh) then
    raise exception 'Je kan voor deze bewoner niemand toewijzen' using errcode = '42501';
  end if;
  select * into s from public.stay where household_id = hh and ended_at is null;
  select ca.id into id from public.care_assignment ca
   where ca.stay_id = s.id and ca.profile_id = profiel
     and ca.valid_from <= now() and (ca.valid_until is null or ca.valid_until > now());
  if id is not null then
    return id;   -- al toegewezen
  end if;
  -- De controle uit 53 (alleen medewerkers, nooit jezelf) blijft gelden.
  insert into public.care_assignment (stay_id, profile_id) values (s.id, profiel) returning care_assignment.id into id;
  return id;
end;
$$;

create or replace function public.stop_toewijzing(toewijzing uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select s.household_id into hh
    from public.care_assignment ca join public.stay s on s.id = ca.stay_id
   where ca.id = toewijzing;
  if hh is null or not public.mag_toewijzen(hh) then
    raise exception 'Je kan deze toewijzing niet stoppen' using errcode = '42501';
  end if;
  update public.care_assignment
     set valid_until = greatest(valid_from, now())
   where id = toewijzing and (valid_until is null or valid_until > now());
end;
$$;

create or replace function public.zet_verblijf(hh uuid, afdeling uuid, kamer text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s public.stay;
begin
  select * into s from public.stay where household_id = hh and ended_at is null;
  if s.id is null or coalesce(public.org_role_of(s.org_id)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator past het verblijf aan' using errcode = '42501';
  end if;
  if afdeling is not null and not exists (select 1 from public.department where id = afdeling and org_id = s.org_id) then
    raise exception 'Deze afdeling hoort niet bij deze organisatie' using errcode = '22023';
  end if;
  update public.stay set department_id = afdeling, room = nullif(btrim(coalesce(kamer, '')), '') where id = s.id;
end;
$$;


-- ---------------------------------------------------------------------
--  4. Medewerkers uitnodigen
-- ---------------------------------------------------------------------

create table if not exists public.org_invitation (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisation (id) on delete cascade,
  email        text not null,
  role         public.org_role not null default 'caregiver',
  token        text not null unique,
  invited_by   uuid references public.profile (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references public.profile (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists org_invitation_org_idx on public.org_invitation (org_id, created_at desc);

alter table public.org_invitation enable row level security;

drop policy if exists org_invitation_read on public.org_invitation;
create policy org_invitation_read on public.org_invitation for select
  using (public.org_role_of(org_id) = 'org_admin');

drop policy if exists org_invitation_revoke on public.org_invitation;
create policy org_invitation_revoke on public.org_invitation for update
  using (public.org_role_of(org_id) = 'org_admin')
  with check (public.org_role_of(org_id) = 'org_admin');

revoke all on public.org_invitation from anon;
revoke insert, delete, truncate on public.org_invitation from authenticated;

create or replace function public.nodig_medewerker_uit(org uuid, adres text, rol text default 'caregiver')
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t   text;
  inv public.org_invitation;
begin
  if public.org_role_of(org) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie nodigt medewerkers uit' using errcode = '42501';
  end if;
  if adres is null or position('@' in adres) = 0 then
    raise exception 'Geen geldig e-mailadres' using errcode = '22023';
  end if;
  if rol not in ('org_admin', 'coordinator', 'caregiver') then
    raise exception 'Onbekende rol' using errcode = '22023';
  end if;

  t := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
  insert into public.org_invitation (org_id, email, role, token, invited_by)
  values (org, lower(btrim(adres)), rol::public.org_role, t, auth.uid())
  returning * into inv;
  return query select inv.id, inv.token, inv.expires_at;
end;
$$;

create or replace function public.org_uitnodiging_bekijk(uitnodiging text)
returns table (organisatie text, rol text, email text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select o.name, i.role::text, i.email,
         case
           when i.revoked_at is not null then 'ingetrokken'
           when i.accepted_at is not null then 'al gebruikt'
           when i.expires_at < now() then 'verlopen'
           else 'open'
         end
    from public.org_invitation i
    join public.organisation o on o.id = i.org_id
   where i.token = uitnodiging and auth.uid() is not null;
$$;

create or replace function public.aanvaard_org_uitnodiging(uitnodiging text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inv        public.org_invitation;
  mijn_email text;
begin
  if auth.uid() is null then
    raise exception 'Log eerst in met je eigen e-mailadres' using errcode = '42501';
  end if;
  select * into inv from public.org_invitation where token = uitnodiging;
  if inv.id is null then
    raise exception 'Deze uitnodiging bestaat niet' using errcode = '22023';
  end if;
  if inv.revoked_at is not null then
    raise exception 'Deze uitnodiging is ingetrokken' using errcode = '22023';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Deze uitnodiging is al gebruikt' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'Deze uitnodiging is verlopen. Vraag een nieuwe.' using errcode = '22023';
  end if;

  select lower(email) into mijn_email from auth.users where id = auth.uid();
  -- Zoals bij familie: het token alleen is niet genoeg.
  if mijn_email is distinct from lower(inv.email) then
    raise exception 'Deze uitnodiging is voor %. Log in met dat adres.', inv.email using errcode = '42501';
  end if;

  insert into public.profile (id, full_name) values (auth.uid(), mijn_email) on conflict (id) do nothing;
  insert into public.org_membership (org_id, profile_id, role)
  values (inv.org_id, auth.uid(), inv.role)
  on conflict (org_id, profile_id) do update set role = excluded.role, active = true;

  update public.org_invitation set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  return inv.org_id;
end;
$$;


-- ---------------------------------------------------------------------
--  5. Rechten op de functies
-- ---------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.org_koppelcode(uuid)', 'public.nieuwe_koppelcode(uuid)', 'public.koppel_met_wzc(uuid, text)',
    'public.mijn_wzc(uuid)', 'public.mijn_organisaties()', 'public.mijn_bewoners(uuid)',
    'public.org_medewerkers(uuid)', 'public.mag_toewijzen(uuid)', 'public.wijs_toe(uuid, uuid)',
    'public.stop_toewijzing(uuid)', 'public.zet_verblijf(uuid, uuid, text)',
    'public.nodig_medewerker_uit(uuid, text, text)', 'public.org_uitnodiging_bekijk(text)',
    'public.aanvaard_org_uitnodiging(text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;
