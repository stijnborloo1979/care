-- =====================================================================
--  LIFEANGLE Care — bewoners importeren en de familie uitnodigen
--  Supabase migratie, versie 84
--
--  Draai dit na 83_rapport.sql.
--  Terugdraaien: supabase/rollback/84_import.sql
--  Tests: supabase/tests/test_84_import.sql
--
--  BESTAAND   een bewoner kwam alleen in Care als de familie zelf een
--             huishouden maakte en dat met de koppelcode koppelde. Een WZC
--             met tachtig bewoners kon niet starten zonder tachtig families.
--  VOORGESTELD importeer_bewoners(org, rijen, proef): het WZC zet een lijst
--             (naam, afdeling, kamer) in Care, uit Excel. Met proef = true
--             wordt alleen nagekeken, zonder iets te bewaren. Elke bewoner
--             krijgt een eigen huishouden met een open verblijf.
--             nodig_familie_uit(hh, adres): het WZC nodigt de eerste
--             familiebeheerder uit; die neemt het huishouden over zoals bij
--             elke uitnodiging (05).
--  RISICO     laag. Nieuwe functies; bestaande tabellen en regels blijven.
--             Een geïmporteerd huishouden heeft tot de familie aanvaardt
--             geen familie; het zorgteam werkt er gewoon mee (toewijzen).
--
--  Wie mag: org admin en coördinator. Het WZC ziet nooit meer dan wat het
--  zelf invoerde (naam, afdeling, kamer) en, alleen voor bewoners die het
--  zelf importeerde, of er al een familiebeheerder is (familie_status).
--  nodig_familie_uit werkt alleen voor zo'n zelf geïmporteerd huishouden
--  waar nog nooit iemand lid van was, en nooit naar het adres van een
--  medewerker van het huis. Een huishouden van een familie (koppelcode)
--  blijft onaantastbaar voor het WZC.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.zet_verblijf(uuid, uuid, text)') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;

-- Welk woonzorgcentrum maakte dit huishouden aan (via import)? Alleen
-- zo'n huishouden mag het WZC aan een eerste familiebeheerder geven; een
-- huishouden van een familie nooit (03: een organisatie eigent zich geen
-- cliënt toe).
alter table public.household add column if not exists import_org uuid references public.organisation (id) on delete set null;

-- import_org zet alleen de server (importeer_bewoners); in de app ligt het vast.
create or replace function public.import_org_vast()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.import_org := null;
    else
      new.import_org := old.import_org;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.import_org_vast() from public, anon, authenticated;

drop trigger if exists household_import_org_vast on public.household;
create trigger household_import_org_vast before insert or update on public.household
  for each row execute function public.import_org_vast();

create or replace function public.importeer_bewoners(org uuid, rijen jsonb, proef boolean default true)
returns table (rij integer, naam text, status text, melding text, household_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r jsonb;
  i integer := 0;
  n text;
  afd text;
  kmr text;
  dep uuid;
  hh uuid;
  gezien text[] := '{}';
begin
  if auth.uid() is null or coalesce(public.org_role_of(org)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator importeert bewoners' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organisation o where o.id = org and o.active) then
    raise exception 'Onbekende organisatie' using errcode = '22023';
  end if;
  if rijen is null or jsonb_typeof(rijen) <> 'array' or jsonb_array_length(rijen) = 0 then
    raise exception 'De lijst is leeg' using errcode = '22023';
  end if;
  if jsonb_array_length(rijen) > 500 then
    raise exception 'Hoogstens 500 bewoners per keer' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(rijen) loop
    i := i + 1;
    n := btrim(coalesce(r ->> 'naam', ''));
    afd := nullif(btrim(coalesce(r ->> 'afdeling', '')), '');
    kmr := nullif(btrim(coalesce(r ->> 'kamer', '')), '');
    dep := null;
    hh := null;

    if char_length(n) = 0 then
      return query select i, n, 'fout'::text, 'Geen naam'::text, null::uuid;
      continue;
    end if;
    if char_length(n) > 120 or char_length(coalesce(kmr, '')) > 20 then
      return query select i, n, 'fout'::text, 'Naam of kamer is te lang'::text, null::uuid;
      continue;
    end if;
    if afd is not null then
      select d.id into dep from public.department d
       where d.org_id = org and d.archived_at is null and lower(d.name) = lower(afd)
       limit 1;
      if dep is null then
        return query select i, n, 'fout'::text, format('Afdeling "%s" bestaat niet', afd), null::uuid;
        continue;
      end if;
    end if;
    if lower(n) = any (gezien) then
      return query select i, n, 'overgeslagen'::text, 'Staat twee keer in de lijst'::text, null::uuid;
      continue;
    end if;
    gezien := gezien || lower(n);
    if exists (select 1 from public.stay s join public.household h on h.id = s.household_id
                where s.org_id = org and s.ended_at is null and lower(h.person_name) = lower(n)) then
      return query select i, n, 'overgeslagen'::text, 'Woont hier al'::text, null::uuid;
      continue;
    end if;

    if not proef then
      insert into public.household (person_name, org_id, org_linked_at, org_linked_by, import_org)
      values (n, org, now(), auth.uid(), org)
      returning id into hh;
      update public.stay set department_id = dep, room = kmr
       where stay.household_id = hh and ended_at is null;
      insert into public.care_log (household_id, occurred_at, title, note, author_id, source)
      values (hh, now(), 'Opgenomen in een woonzorgcentrum', (select o.name from public.organisation o where o.id = org), auth.uid(), 'system');
    end if;
    return query select i, n, 'ok'::text, null::text, hh;
  end loop;
end;
$$;

revoke execute on function public.importeer_bewoners(uuid, jsonb, boolean) from public, anon;
grant execute on function public.importeer_bewoners(uuid, jsonb, boolean) to authenticated, service_role;

-- Heeft deze bewoner al een familiebeheerder, of loopt er een uitnodiging?
create or replace function public.familie_status(org uuid)
returns table (household_id uuid, heeft_familie boolean, uitgenodigd boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.household_id,
         exists (select 1 from public.membership m where m.household_id = s.household_id and m.role = 'admin'),
         exists (select 1 from public.invitation v
                  where v.household_id = s.household_id and v.role = 'admin'
                    and v.accepted_at is null and v.revoked_at is null and v.expires_at > now())
    from public.stay s
    join public.household h on h.id = s.household_id
   where s.org_id = org and s.ended_at is null
     and h.import_org = org
     and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

revoke execute on function public.familie_status(uuid) from public, anon;
grant execute on function public.familie_status(uuid) to authenticated, service_role;

-- De eerste familiebeheerder uitnodigen. Alleen zolang er nog geen is.
create or replace function public.nodig_familie_uit(hh uuid, adres text, relatie text default null)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o uuid;
  t text;
  inv public.invitation;
begin
  select s.org_id into o from public.stay s where s.household_id = hh and s.ended_at is null;
  if o is null or auth.uid() is null
     or coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator van het woonzorgcentrum nodigt de familie uit' using errcode = '42501';
  end if;
  -- Alleen een huishouden dat dit WZC zelf importeerde, van een actief
  -- huis, en waar nog nooit iemand lid van was.
  if not exists (select 1 from public.household h join public.organisation og on og.id = o
                  where h.id = hh and h.import_org = o and h.org_id = o and og.active) then
    raise exception 'Alleen voor een bewoner die het woonzorgcentrum zelf importeerde' using errcode = '42501';
  end if;
  if exists (select 1 from public.membership m where m.household_id = hh)
     or exists (select 1 from public.invitation v where v.household_id = hh and v.accepted_at is not null) then
    raise exception 'Deze bewoner heeft al een familiebeheerder; die nodigt de rest van de familie uit' using errcode = '22023';
  end if;
  if adres is null or position('@' in adres) = 0 or char_length(adres) > 254 then
    raise exception 'Geen geldig e-mailadres' using errcode = '22023';
  end if;
  -- Een medewerker van dit huis wordt geen familiebeheerder van een bewoner.
  if exists (select 1 from public.org_membership om join auth.users u on u.id = om.profile_id
              where om.org_id = o and lower(u.email) = lower(btrim(adres))) then
    raise exception 'Dit adres hoort bij een medewerker van het woonzorgcentrum' using errcode = '42501';
  end if;
  if (select count(*) from public.invitation v
       where v.invited_by = auth.uid() and v.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Te veel uitnodigingen. Probeer het over een uur opnieuw.' using errcode = '42501';
  end if;

  -- Een vorige, nog open uitnodiging voor deze bewoner vervalt.
  update public.invitation v set revoked_at = now()
   where v.household_id = hh and v.role = 'admin' and v.accepted_at is null and v.revoked_at is null;

  t := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
  insert into public.invitation (household_id, email, role, relation, token, invited_by, expires_at)
  values (hh, lower(btrim(adres)), 'admin', nullif(btrim(coalesce(relatie, '')), ''), t, auth.uid(), now() + interval '14 days')
  returning * into inv;
  return query select inv.id, inv.token, inv.expires_at;
end;
$$;

revoke execute on function public.nodig_familie_uit(uuid, text, text) from public, anon;
grant execute on function public.nodig_familie_uit(uuid, text, text) to authenticated, service_role;
