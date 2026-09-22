-- =====================================================================
--  THUIS — tablet koppelen
--  Supabase migratie, versie 12
--
--  Draai dit na 01_schema.sql en 05_auth_invites.sql.
--
--  De persoon gaat geen mail openen en geen wachtwoord onthouden. Daarom
--  maakt familie een koppelcode aan, en tikt die code één keer in op de
--  tablet. Daarna blijft de tablet ingelogd als de persoon.
--
--  De code zelf geeft geen toegang tot iets: ze wordt ingewisseld door de
--  edge function pair-device, die controleert of ze geldig is en dan pas
--  een sessie aanmaakt. De functie draait met de service role, de code
--  nooit.
-- =====================================================================

create table if not exists public.device_pairing (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  code          text not null unique,
  created_by    uuid references public.profile (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '10 minutes',
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists device_pairing_hh_idx on public.device_pairing (household_id, created_at desc);

alter table public.device_pairing enable row level security;

-- Familie ziet haar eigen koppelcodes, verder niemand. De tablet zelf
-- leest deze tabel nooit: die gaat via de edge function.
drop policy if exists device_pairing_read on public.device_pairing;
create policy device_pairing_read on public.device_pairing for select
  using (public.auth_role(household_id) in ('admin', 'member'));

-- Pogingen bijhouden, zodat niemand codes kan blijven raden.
create table if not exists public.pairing_attempt (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  ip          text,
  succeeded   boolean not null default false
);

alter table public.pairing_attempt enable row level security;
-- Geen policies: alleen de service role schrijft en leest dit.

create or replace function public.create_pairing_code(hh uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  c    text;
  rij  public.device_pairing;
begin
  if public.auth_role(hh) is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een tablet koppelen';
  end if;

  -- Eén geldige code per huishouden tegelijk: een oude code die nog rondslingert,
  -- vervalt zodra er een nieuwe gemaakt wordt.
  -- De kolommen expliciet via een alias: "code" en "expires_at" zijn ook
  -- de namen van wat deze functie teruggeeft, en zonder alias weet
  -- Postgres niet welke van de twee bedoeld is. Dat gaf een fout 400.
  update public.device_pairing dp
     set expires_at = now()
   where dp.household_id = hh and dp.used_at is null and dp.expires_at > now();

  -- Acht cijfers: honderd miljoen mogelijkheden in een venster van tien
  -- minuten, en toch nog makkelijk over te tikken als 4821 9037.
  loop
    c := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    exit when not exists (select 1 from public.device_pairing d where d.code = c);
  end loop;

  insert into public.device_pairing (household_id, code, created_by)
  values (hh, c, auth.uid())
  returning * into rij;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Koppelcode voor de tablet aangemaakt', auth.uid(), 'family');

  return query select rij.code, rij.expires_at;
end;
$$;

grant execute on function public.create_pairing_code(uuid) to authenticated;
