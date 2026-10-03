-- =====================================================================
--  LIFEANGLE Care — de bewoner stuurt een bericht aan zijn zorgteam
--  Supabase migratie, versie 68
--
--  Draai dit na 67_uitnodigingen_in_app.sql.
--  Terugdraaien: supabase/rollback/68_bericht_zorgteam.sql
--  Tests: supabase/tests/test_68_bericht_zorgteam.sql
--
--  BESTAAND   de bewoner kon vanaf zijn tablet alleen zijn familie
--             berichten sturen.
--  VOORGESTELD op de tablet: "Iets vragen aan het zorgteam". Het bericht
--             komt alleen bij het zorgteam van die bewoner: wie toegewezen
--             is en de team lead van zijn afdeling (toegewezen(), 53). Het
--             team ziet het in de app (geen push), markeert het als gezien
--             en kan kort antwoorden; de bewoner ziet dat op zijn tablet.
--  REDEN      gevraagd: berichten van bewoners krijgen in LifeAngle Care.
--  RISICO     laag. Nieuw, raakt niets bestaands.
--
--  Wie mag wat
--  -----------
--    sturen        de bewoner zelf: de tablet (membership 'person') of wie
--                  de app zelf gebruikt (is_self), alleen bij een lopend
--                  verblijf; via bericht_aan_zorgteam()
--    lezen         de bewoner (alles van hemzelf); het zorgteam alleen de
--                  berichten van het lopende verblijf (een volgend WZC ziet
--                  niets van een vorig)
--    gezien/antw.  het zorgteam, via markeer_bericht_gezien() en
--                  antwoord_aan_bewoner()
--    nooit         beheerder of coördinator zonder toewijzing (J4), familie
--    bewaren       zoals de zorgnotities: bewaartermijn_maanden van het WZC
--                  (61); bewonerbericht_opruimen() elke nacht om 03:35
-- =====================================================================

do $$
begin
  if to_regprocedure('public.toegewezen(uuid)') is null then
    raise exception 'Draai eerst 53_org_zonder_inhoud.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'organisation' and column_name = 'bewaartermijn_maanden') then
    raise exception 'Draai eerst 61_bewaartermijn.sql';
  end if;
end
$$;

create or replace function public.is_bewoner(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.membership m
             where m.household_id = hh and m.profile_id = auth.uid() and m.role = 'person')
    or public.is_self(hh));
$$;

create or replace function public.lopend_verblijf(hh uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Alleen voor wie een band heeft met dit huishouden.
  select id from public.stay
   where household_id = hh and ended_at is null
     and (public.is_bewoner(hh) or public.toegewezen(hh) or public.family_role(hh) is not null);
$$;

create table if not exists public.resident_message (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  stay_id      uuid not null references public.stay (id) on delete cascade,
  van          text not null check (van in ('bewoner', 'team')),
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  antwoord_op  uuid references public.resident_message (id) on delete cascade,
  author_id    uuid references public.profile (id) on delete set null,
  gezien_at    timestamptz,
  gezien_door  uuid references public.profile (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists resident_message_hh_idx on public.resident_message (household_id, created_at desc);
create index if not exists resident_message_open_idx on public.resident_message (stay_id) where van = 'bewoner' and gezien_at is null;

comment on table public.resident_message is
  'Berichten van de bewoner aan zijn zorgteam, en de korte antwoorden. Alleen voor de bewoner en het team van het lopende verblijf.';

alter table public.resident_message enable row level security;

drop policy if exists resident_message_read on public.resident_message;
create policy resident_message_read on public.resident_message for select
  using (
    public.is_bewoner(household_id)
    or (public.toegewezen(household_id) and stay_id = public.lopend_verblijf(household_id))
  );

-- Schrijven alleen via de functies hieronder.
revoke all on public.resident_message from anon;
revoke insert, update, delete, truncate on public.resident_message from authenticated;
grant select on public.resident_message to authenticated;

create or replace function public.bericht_aan_zorgteam(hh uuid, tekst text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  verblijf uuid;
  nieuw    uuid;
begin
  if not public.is_bewoner(hh) then
    raise exception 'Alleen de bewoner zelf stuurt een bericht aan het zorgteam' using errcode = '42501';
  end if;
  verblijf := public.lopend_verblijf(hh);
  if verblijf is null then
    raise exception 'Er is geen woonzorgcentrum gekoppeld' using errcode = '22023';
  end if;
  if tekst is null or char_length(btrim(tekst)) = 0 then
    raise exception 'Het bericht is leeg' using errcode = '22023';
  end if;
  -- Een vangnet tegen een knop die blijft hangen, geen rem op gewoon gebruik.
  if (select count(*) from public.resident_message
       where household_id = hh and van = 'bewoner' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Je hebt al veel berichten gestuurd. Het zorgteam komt zo snel mogelijk.' using errcode = '42501';
  end if;
  insert into public.resident_message (household_id, stay_id, van, body, author_id)
  values (hh, verblijf, 'bewoner', btrim(tekst), auth.uid())
  returning id into nieuw;
  return nieuw;
end;
$$;

create or replace function public.markeer_bericht_gezien(bericht uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.resident_message;
begin
  select * into r from public.resident_message where id = bericht;
  if r.id is null or not public.toegewezen(r.household_id)
     or r.stay_id is distinct from public.lopend_verblijf(r.household_id) then
    raise exception 'Geen toegang tot dit bericht' using errcode = '42501';
  end if;
  update public.resident_message
     set gezien_at = coalesce(gezien_at, now()), gezien_door = coalesce(gezien_door, auth.uid())
   where id = bericht and van = 'bewoner';
end;
$$;

create or replace function public.antwoord_aan_bewoner(bericht uuid, tekst text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r     public.resident_message;
  nieuw uuid;
begin
  select * into r from public.resident_message where id = bericht;
  if r.id is null or r.van <> 'bewoner' or not public.toegewezen(r.household_id)
     or r.stay_id is distinct from public.lopend_verblijf(r.household_id) then
    raise exception 'Geen toegang tot dit bericht' using errcode = '42501';
  end if;
  if tekst is null or char_length(btrim(tekst)) = 0 then
    raise exception 'Het antwoord is leeg' using errcode = '22023';
  end if;
  perform public.markeer_bericht_gezien(bericht);
  insert into public.resident_message (household_id, stay_id, van, body, antwoord_op, author_id)
  values (r.household_id, r.stay_id, 'team', btrim(tekst), bericht, auth.uid())
  returning id into nieuw;
  return nieuw;
end;
$$;

create or replace function public.bewonerbericht_opruimen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.resident_message m
   using public.stay s, public.organisation o
   where s.id = m.stay_id and o.id = s.org_id
     and m.created_at < now() - make_interval(months => coalesce(o.bewaartermijn_maanden, 24));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.is_bewoner(uuid) from public, anon;
revoke execute on function public.lopend_verblijf(uuid) from public, anon;
revoke execute on function public.bericht_aan_zorgteam(uuid, text) from public, anon;
revoke execute on function public.markeer_bericht_gezien(uuid) from public, anon;
revoke execute on function public.antwoord_aan_bewoner(uuid, text) from public, anon;
revoke execute on function public.bewonerbericht_opruimen() from public, anon, authenticated;
grant execute on function public.is_bewoner(uuid) to authenticated;
grant execute on function public.lopend_verblijf(uuid) to authenticated;
grant execute on function public.bericht_aan_zorgteam(uuid, text) to authenticated;
grant execute on function public.markeer_bericht_gezien(uuid) to authenticated;
grant execute on function public.antwoord_aan_bewoner(uuid, text) to authenticated;
grant execute on function public.bewonerbericht_opruimen() to service_role;

do $$
begin
  alter publication supabase_realtime add table public.resident_message;
exception when others then null;
end
$$;

do $$
begin
  perform cron.unschedule('bewonerberichten-opruimen');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('bewonerberichten-opruimen', '35 3 * * *', 'select public.bewonerbericht_opruimen()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw.';
end
$$;
