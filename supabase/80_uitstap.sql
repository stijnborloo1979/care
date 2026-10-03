-- =====================================================================
--  LIFEANGLE Care — uitstap melden: de familie neemt mama mee
--  Supabase migratie, versie 80
--
--  Draai dit na 79_nieuws_wzc.sql.
--  Terugdraaien: supabase/rollback/80_uitstap.sql
--  Tests: supabase/tests/test_80_uitstap.sql
--
--  BESTAAND   neemt de familie een bewoner mee, dan wist het team dat alleen
--             als iemand het zei. Een lege kamer betekende zoeken en bellen.
--  VOORGESTELD uitstap: met wie, van wanneer tot wanneer, één zin. De familie
--             meldt het vooraf; het team ziet het bij de bewoner en duidt
--             "vertrokken" en "terug" aan. De tablet zegt "Uitstap met Els".
--             Is ze terug, dan krijgt de familie een melding.
--  REDEN      minder zoeken en bellen op de afdeling.
--  RISICO     laag. Nieuwe tabel; niets bestaands verandert.
--
--  Wie mag wat
--  -----------
--    lezen      wie de agenda mag lezen (agenda.read): bewoner, familie,
--               het toegewezen zorgteam. Niet de org admin (J4).
--    melden     familie met agenda.write, of het toegewezen zorgteam; op
--               eigen naam. Niet ouder dan een dag, hoogstens 14 dagen lang.
--    vertrokken, terug, annuleren
--               via uitstap_stap(): dezelfde mensen. Geen rechtstreekse
--               aanpassingen of wissen vanuit de app: dit is ook een
--               veiligheidsspoor ("is ze terug?").
--    bewaren    90 dagen na de terugkeer (of het geplande einde, ook als
--               niemand "terug" aanduidde); daarna ruimt uitstap_opruimen()
--               op (03:45)
-- =====================================================================

do $$
begin
  if to_regprocedure('public.can_legacy(uuid, text)') is null then
    raise exception 'Draai eerst 49_can_legacy.sql';
  end if;
end
$$;

create table if not exists public.uitstap (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  met_wie        text not null check (char_length(btrim(met_wie)) between 1 and 80),
  vertrek        timestamptz not null,
  terug          timestamptz not null,
  notitie        text check (notitie is null or char_length(notitie) <= 300),
  status         text not null default 'gepland' check (status in ('gepland', 'weg', 'terug', 'geannuleerd')),
  vertrokken_at  timestamptz,
  terug_at       timestamptz,
  created_by     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint uitstap_tijd check (terug > vertrek and terug - vertrek <= interval '14 days')
);
create index if not exists uitstap_hh_idx on public.uitstap (household_id, vertrek desc);

comment on table public.uitstap is
  'Een uitstap van de bewoner met familie: wie, van wanneer tot wanneer, en of ze vertrokken en terug is.';

alter table public.uitstap enable row level security;

drop policy if exists uitstap_read on public.uitstap;
create policy uitstap_read on public.uitstap for select
  using (public.can_legacy(household_id, 'agenda.read'));

drop policy if exists uitstap_insert on public.uitstap;
create policy uitstap_insert on public.uitstap for insert
  with check (
    created_by = auth.uid()
    and (public.can_legacy(household_id, 'agenda.write') or public.toegewezen(household_id))
  );

revoke all on public.uitstap from anon;
revoke update, delete, truncate on public.uitstap from authenticated;
grant select, insert on public.uitstap to authenticated;

-- Vanuit de app: altijd gepland, de servertijd, en een redelijk moment.
create or replace function public.uitstap_nieuw()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    new.status := 'gepland';
    new.vertrokken_at := null;
    new.terug_at := null;
    new.created_at := now();
    if new.vertrek < now() - interval '1 day' then
      raise exception 'Een uitstap van langer dan een dag geleden meld je niet meer' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.uitstap_nieuw() from public, anon, authenticated;

drop trigger if exists uitstap_nieuw on public.uitstap;
create trigger uitstap_nieuw before insert on public.uitstap
  for each row execute function public.uitstap_nieuw();

-- Vertrokken, terug of geannuleerd.
create or replace function public.uitstap_stap(uitstap_id uuid, stap text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.uitstap;
  naam text;
begin
  select * into u from public.uitstap where id = uitstap_id for update;
  if not found
     or auth.uid() is null
     or not (public.can_legacy(u.household_id, 'agenda.write') or public.toegewezen(u.household_id)) then
    raise exception 'Deze uitstap vind ik niet' using errcode = '42501';
  end if;

  if stap = 'weg' and u.status = 'gepland' then
    update public.uitstap set status = 'weg', vertrokken_at = now() where id = u.id;
  elsif stap = 'terug' and u.status = 'weg' then
    update public.uitstap set status = 'terug', terug_at = now() where id = u.id;
    -- Gerust stellen: de familie hoort dat ze terug is (alleen als het team
    -- het aanduidde; wie haar zelf terugbracht, weet het al).
    if public.toegewezen(u.household_id) then
      select person_name into naam from public.household where id = u.household_id;
      insert into public.notification (household_id, level, body, target_role)
      values (u.household_id, 'ok', format('%s is terug van de uitstap met %s.', coalesce(naam, 'De bewoner'), left(u.met_wie, 40)), 'admin');
    end if;
  elsif stap = 'geannuleerd' and u.status = 'gepland' then
    update public.uitstap set status = 'geannuleerd' where id = u.id;
  else
    raise exception 'Dat kan nu niet meer' using errcode = '22023';
  end if;
  return stap;
end;
$$;

revoke execute on function public.uitstap_stap(uuid, text) from public, anon;
grant execute on function public.uitstap_stap(uuid, text) to authenticated, service_role;

-- Opruimen: 90 dagen na de terugkeer (of na het geplande einde).
create or replace function public.uitstap_opruimen()
returns integer
language sql
security definer
set search_path = public
as $$
  with weg as (
    delete from public.uitstap
     where coalesce(terug_at, terug) < now() - interval '90 days'
    returning 1)
  select count(*)::integer from weg;
$$;

revoke execute on function public.uitstap_opruimen() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('uitstap-opruimen', '45 3 * * *', 'select public.uitstap_opruimen()');
exception when others then
  raise notice 'pg_cron niet beschikbaar: plan uitstap_opruimen() zelf in.';
end
$$;
