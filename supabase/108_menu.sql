-- =====================================================================
--  LIFEANGLE Care — het weekmenu van het woonzorgcentrum
--  Supabase migratie, versie 108
--
--  Draai dit na 107_maaltijd_registratie.sql.
--  Terugdraaien: supabase/rollback/108_menu.sql
--
--  BESTAAND   de keuken stuurt het menu per mail of op papier; de tablets
--             tonen het niet, en niemand weet of de week al is ingevoerd.
--  VOORGESTELD org_menu: per organisatie en per dag soep, middagmaal en
--             dessert, met allergenen. Elke medewerker vult in; het menu
--             wordt pas zichtbaar na bevestiging door een coördinator of de
--             beheerder. Elke wijziging komt in een logboek.
--  REDEN      één menu op elke tablet, zonder dat iemand het elke week
--             opnieuw op de tablet moet zetten.
--  RISICO     laag. Nieuwe tabellen; bestaande tabellen veranderen niet.
--
--  Wie mag wat
--  -----------
--    lezen          bewoners en familie zien alleen het bevestigde menu;
--                   medewerkers zien ook het concept.
--    invullen       elke actieve medewerker (org_membership) mag concepten
--                   opslaan. De status wordt door de database op 'concept'
--                   gezet, ook bij een bestaand bevestigd menu: een gewijzigd
--                   menu is pas zichtbaar na opnieuw bevestigen.
--    allergenen     alleen de beheerder en de coördinator. Een medewerker
--                   krijgt een fout bij een poging ze te wijzigen.
--    bevestigen     alleen de beheerder en de coördinator (menu_publiceer).
--    logboek        wie, wanneer en welke waarden, voor elke opslag.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.org_role_of(uuid)') is null or to_regprocedure('public.mag_nieuws_lezen(uuid, uuid)') is null then
    raise exception 'Draai eerst 03_organisations.sql en 79_nieuws_wzc.sql';
  end if;
end
$$;

create table if not exists public.org_menu (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisation (id) on delete cascade,
  datum              date not null,
  soep               text check (soep is null or char_length(soep) <= 200),
  soep_allergenen    text check (soep_allergenen is null or char_length(soep_allergenen) <= 200),
  middag             text check (middag is null or char_length(middag) <= 200),
  middag_allergenen  text check (middag_allergenen is null or char_length(middag_allergenen) <= 200),
  dessert            text check (dessert is null or char_length(dessert) <= 200),
  dessert_allergenen text check (dessert_allergenen is null or char_length(dessert_allergenen) <= 200),
  notitie            text check (notitie is null or char_length(notitie) <= 300),
  status             text not null default 'concept' check (status in ('concept', 'gepubliceerd')),
  bijgewerkt_door    uuid references public.profile (id) on delete set null default auth.uid(),
  bijgewerkt_at      timestamptz not null default now(),
  bevestigd_at       timestamptz,
  unique (org_id, datum)
);
create index if not exists org_menu_org_datum_idx on public.org_menu (org_id, datum);

comment on table public.org_menu is
  'Het menu per dag voor het hele woonzorgcentrum. Bewoners en familie zien alleen status = gepubliceerd. Allergenen vult alleen de beheerder of coördinator in.';

create table if not exists public.org_menu_logboek (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organisation (id) on delete cascade,
  datum     date not null,
  door      uuid references public.profile (id) on delete set null,
  actie     text not null check (actie in ('opslaan', 'bevestigen')),
  oud       jsonb,
  nieuw     jsonb,
  at        timestamptz not null default now()
);
create index if not exists org_menu_logboek_idx on public.org_menu_logboek (org_id, datum, at desc);

comment on table public.org_menu_logboek is
  'Logboek van het weekmenu: wie wat wijzigde en wanneer. Bevat alleen de menutekst, geen persoonsgegevens van bewoners.';

-- Bewaken: rol, status en allergenen. Draait ook voor de RPC's, dus geen
-- omweg via een andere functie.
create or replace function public.org_menu_bewaak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol public.org_role;
  allergenen_veranderd boolean;
begin
  rol := public.org_role_of(new.org_id);
  if rol is null then
    raise exception 'Je hoort niet bij dit woonzorgcentrum' using errcode = '42501';
  end if;

  new.bijgewerkt_door := auth.uid();
  new.bijgewerkt_at := now();

  if tg_op = 'INSERT' then
    allergenen_veranderd := new.soep_allergenen is not null or new.middag_allergenen is not null or new.dessert_allergenen is not null;
  else
    allergenen_veranderd :=
         new.soep_allergenen is distinct from old.soep_allergenen
      or new.middag_allergenen is distinct from old.middag_allergenen
      or new.dessert_allergenen is distinct from old.dessert_allergenen;
  end if;

  if rol = 'caregiver' then
    if allergenen_veranderd then
      raise exception 'Allergenen vult de keuken of een coördinator in' using errcode = '42501';
    end if;
    -- Een medewerker bewaart altijd een concept. Ook een bevestigd menu
    -- wordt pas weer zichtbaar na opnieuw bevestigen.
    new.status := 'concept';
    new.bevestigd_at := null;
  end if;

  if new.status = 'gepubliceerd' and (tg_op = 'INSERT' or old.status is distinct from 'gepubliceerd') then
    new.bevestigd_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists org_menu_bewaak on public.org_menu;
create trigger org_menu_bewaak
  before insert or update on public.org_menu
  for each row execute function public.org_menu_bewaak();

-- Logboek: één rij per opslag, met de oude en nieuwe tekst.
create or replace function public.org_menu_loggen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_menu_logboek (org_id, datum, door, actie, oud, nieuw)
  values (
    new.org_id,
    new.datum,
    auth.uid(),
    case when new.status = 'gepubliceerd' and (tg_op = 'INSERT' or old.status is distinct from 'gepubliceerd') then 'bevestigen' else 'opslaan' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'bijgewerkt_door' - 'bijgewerkt_at' - 'bevestigd_at' else null end,
    to_jsonb(new) - 'bijgewerkt_door' - 'bijgewerkt_at' - 'bevestigd_at'
  );
  return new;
end;
$$;

drop trigger if exists org_menu_log on public.org_menu;
create trigger org_menu_log
  after insert or update on public.org_menu
  for each row execute function public.org_menu_loggen();

alter table public.org_menu enable row level security;
alter table public.org_menu_logboek enable row level security;

drop policy if exists org_menu_lezen on public.org_menu;
create policy org_menu_lezen on public.org_menu for select
  using (
    public.is_org_staff(org_id)
    or (status = 'gepubliceerd' and public.mag_nieuws_lezen(org_id, null))
  );

drop policy if exists org_menu_invullen on public.org_menu;
create policy org_menu_invullen on public.org_menu for insert
  with check (public.is_org_staff(org_id));

drop policy if exists org_menu_bijwerken on public.org_menu;
create policy org_menu_bijwerken on public.org_menu for update
  using (public.is_org_staff(org_id))
  with check (public.is_org_staff(org_id));

drop policy if exists org_menu_wissen on public.org_menu;
create policy org_menu_wissen on public.org_menu for delete
  using (public.org_role_of(org_id) in ('org_admin', 'coordinator'));

drop policy if exists org_menu_logboek_lezen on public.org_menu_logboek;
create policy org_menu_logboek_lezen on public.org_menu_logboek for select
  using (public.is_org_staff(org_id));

revoke all on public.org_menu from anon;
revoke all on public.org_menu_logboek from anon;
revoke truncate on public.org_menu from authenticated;
grant select, insert, update, delete on public.org_menu to authenticated;
grant select on public.org_menu_logboek to authenticated;

-- Opslaan: de RPC is security invoker, dus de policies gelden. De trigger
-- bewaakt de rol en de allergenen.
create or replace function public.menu_bewaar(
  p_org uuid,
  p_datum date,
  p_soep text,
  p_soep_allergenen text,
  p_middag text,
  p_middag_allergenen text,
  p_dessert text,
  p_dessert_allergenen text,
  p_notitie text
)
returns public.org_menu
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.org_menu;
begin
  -- Geen INSERT ... ON CONFLICT: de BEFORE INSERT-trigger zou dan ook bij een
  -- bestaande dag vuren, en een medewerker zou zo geweigerd worden terwijl
  -- de allergenen niet veranderen.
  select * into r from public.org_menu where org_id = p_org and datum = p_datum;
  if found then
    update public.org_menu set
      soep = nullif(btrim(p_soep), ''),
      soep_allergenen = nullif(btrim(p_soep_allergenen), ''),
      middag = nullif(btrim(p_middag), ''),
      middag_allergenen = nullif(btrim(p_middag_allergenen), ''),
      dessert = nullif(btrim(p_dessert), ''),
      dessert_allergenen = nullif(btrim(p_dessert_allergenen), ''),
      notitie = nullif(btrim(p_notitie), '')
    where id = r.id
    returning * into r;
  else
    insert into public.org_menu (
      org_id, datum, soep, soep_allergenen, middag, middag_allergenen, dessert, dessert_allergenen, notitie
    )
    values (
      p_org, p_datum,
      nullif(btrim(p_soep), ''), nullif(btrim(p_soep_allergenen), ''),
      nullif(btrim(p_middag), ''), nullif(btrim(p_middag_allergenen), ''),
      nullif(btrim(p_dessert), ''), nullif(btrim(p_dessert_allergenen), ''),
      nullif(btrim(p_notitie), '')
    )
    returning * into r;
  end if;
  return r;
end;
$$;

revoke execute on function public.menu_bewaar(uuid, date, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.menu_bewaar(uuid, date, text, text, text, text, text, text, text) to authenticated, service_role;

-- Bevestigen van een reeks dagen: alleen beheerder of coördinator.
create or replace function public.menu_publiceer(p_org uuid, p_van date, p_tot date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  aantal integer;
begin
  if public.org_role_of(p_org) not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator bevestigt het menu' using errcode = '42501';
  end if;
  if p_tot < p_van or p_tot - p_van > 31 then
    raise exception 'Kies een periode van hoogstens een maand' using errcode = '22023';
  end if;
  update public.org_menu
     set status = 'gepubliceerd'
   where org_id = p_org and datum between p_van and p_tot and status <> 'gepubliceerd';
  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

revoke execute on function public.menu_publiceer(uuid, date, date) from public, anon;
grant execute on function public.menu_publiceer(uuid, date, date) to authenticated, service_role;

-- Het menu voor vandaag (of een dag): alleen wat bevestigd is voor bewoners.
create or replace function public.menu_van_dag(p_org uuid, p_datum date)
returns setof public.org_menu
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.org_menu
   where org_id = p_org and datum = p_datum;
$$;

revoke execute on function public.menu_van_dag(uuid, date) from public, anon;
grant execute on function public.menu_van_dag(uuid, date) to authenticated, service_role;
