-- =====================================================================
--  LIFEANGLE Care — maaltijden staan standaard op "gegeten"
--  Supabase migratie, versie 109
--
--  Draai dit na 108_menu.sql.
--  Terugdraaien: supabase/rollback/109_maaltijd_standaard.sql
--
--  BESTAAND   het team noteert elke maaltijd met de hand; dat is te veel
--             werk. Een uitstap laat de maaltijd standaard vervallen, tenzij
--             de familie kiest dat de bewoner blijft eten (106).
--  VOORGESTELD een maaltijd telt standaard als gegeten. Het team wijzigt
--             alleen wat afwijkt. Een uitstap waarop de bewoner niet blijft
--             eten, zet de maaltijd op "niet"; dat is de standaard van de
--             uitstap, de familie zet het uit als de bewoner blijft eten.
--  REDEN      minder handwerk, zonder dat een gegeten maaltijd als feit
--             wordt vastgelegd terwijl niemand heeft gekeken.
--  RISICO     middel. De standaard is geen waarneming. Daarom krijgt elke
--             maaltijd een bron: 'standaard' (niet gecontroleerd), 'team'
--             (door iemand bevestigd) of 'uitstap' (door de familie).
--             De analyse telt alleen bevestigde maaltijden als bevestigd.
--
--  Bestaande uitstappen houden hun keuze: false blijft "niet eten mee", zoals
--  het nu al werkt. Alleen nieuwe uitstappen beginnen met "blijft eten".
--
--  Wie mag wat
--  -----------
--    standaard      niet opgeslagen; wordt berekend uit de uitstap en de
--                   registratie. Geen extra rechten nodig.
--    overzicht      medewerkers van het WZC, en alleen de bewoners die zij
--                   mogen zien (mag_maaltijd).
--    analyse        medewerkers van het WZC, alleen aantallen.
--    uitstap        de familie zet "blijft eten" aan of uit via
--                   uitstap_eetkeuze (106), tot het vertrek.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.maaltijd_analyse(uuid, date, date)') is null or to_regprocedure('public.uitstap_eetkeuze(uuid, boolean)') is null then
    raise exception 'Draai eerst 106_uitstap_maaltijd.sql en 107_maaltijd_registratie.sql';
  end if;
end
$$;

-- Nieuwe uitstappen beginnen met: blijft eten.
alter table public.uitstap alter column eet_mee set default true;

comment on column public.uitstap.eet_mee is
  'Blijft de bewoner tijdens de uitstap eten? Standaard ja. Zet de familie dit uit, dan vervalt de maaltijd van het huis en telt die niet mee.';

-- De maaltijd van één bewoner op één moment en dag: de registratie van het team
-- als die er is, anders de uitstap, anders de standaard "gegeten".
-- Niet direct aanroepbaar: alleen door de functies hieronder.
create or replace function public.maaltijd_stand(p_household uuid, p_moment uuid, p_dag date)
returns table (o_status text, o_bron text, o_notitie text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.maaltijd_registratie;
  begint time;
  tijdstip timestamptz;
begin
  select * into r
    from public.maaltijd_registratie
   where household_id = p_household and afdeling_dag_id = p_moment and dag = p_dag;
  if found then
    return query select r.status, 'team'::text, r.notitie;
    return;
  end if;

  select ad.begint into begint from public.afdeling_dag ad where ad.id = p_moment;
  tijdstip := (p_dag + begint) at time zone 'Europe/Brussels';

  if exists (
    select 1 from public.uitstap u
     where u.household_id = p_household
       and u.status <> 'geannuleerd'
       and not u.eet_mee
       and tijdstip >= u.vertrek
       and tijdstip <= u.terug
  ) then
    return query select 'niet'::text, 'uitstap'::text, null::text;
    return;
  end if;

  return query select 'gegeten'::text, 'standaard'::text, null::text;
end;
$$;

revoke execute on function public.maaltijd_stand(uuid, uuid, date) from public, anon, authenticated;

-- Het overzicht van één dag voor het team: per bewoner en maaltijd, met de bron.
create or replace function public.maaltijd_dag_overzicht(p_org uuid, p_dag date)
returns table (household_id uuid, afdeling_dag_id uuid, moment_titel text, status text, bron text, notitie text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_org_staff(p_org) then
    raise exception 'Alleen medewerkers van dit woonzorgcentrum' using errcode = '42501';
  end if;

  return query
  select s.household_id, ad.id, ad.titel, st.o_status, st.o_bron, st.o_notitie
    from public.afdeling_dag ad
    join public.stay s
      on s.org_id = p_org
     and (ad.department_id is null or s.department_id = ad.department_id)
     and s.started_at < (p_dag + 1)
     and (s.ended_at is null or s.ended_at >= p_dag)
    cross join lateral public.maaltijd_stand(s.household_id, ad.id, p_dag) st
   where ad.org_id = p_org
     and ad.actief
     and ad.soort = 'maaltijd'
     and extract(isodow from p_dag)::smallint = any(ad.dagen)
     and public.mag_maaltijd(s.household_id);
end;
$$;

revoke execute on function public.maaltijd_dag_overzicht(uuid, date) from public, anon;
grant execute on function public.maaltijd_dag_overzicht(uuid, date) to authenticated, service_role;

-- De analyse, met de standaard erin verwerkt.
-- Een maaltijd die vervalt omdat de bewoner op uitstap is, telt niet mee.
-- "geregistreerd" zijn alleen de maaltijden die het team heeft bevestigd.
-- "gegeten" telt ook de standaard, dus het verschil is wat niet bevestigd is.
create or replace function public.maaltijd_analyse_stand(p_org uuid, p_van date, p_tot date)
returns table (
  afdeling_naam        text,
  moment_titel         text,
  aantal_verwacht      bigint,
  aantal_geregistreerd bigint,
  aantal_gegeten       bigint,
  aantal_half          bigint,
  aantal_niet          bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_org_staff(p_org) then
    raise exception 'Alleen medewerkers van dit woonzorgcentrum' using errcode = '42501';
  end if;
  if p_tot < p_van or p_tot - p_van > 92 then
    raise exception 'Kies een periode van hoogstens 3 maanden' using errcode = '22023';
  end if;

  return query
  with dagen as (
    select g.d::date as dag from generate_series(p_van, p_tot, interval '1 day') as g(d)
  ),
  cel as (
    select coalesce(dep.name, 'Hele huis') as afdeling,
           ad.titel,
           ad.id as moment_id,
           st.o_status,
           st.o_bron
      from public.afdeling_dag ad
      left join public.department dep on dep.id = ad.department_id
      cross join dagen dg
      join public.stay s
        on s.org_id = p_org
       and (ad.department_id is null or s.department_id = ad.department_id)
       and s.started_at < (dg.dag + 1)
       and (s.ended_at is null or s.ended_at >= dg.dag)
      cross join lateral public.maaltijd_stand(s.household_id, ad.id, dg.dag) st
     where ad.org_id = p_org
       and ad.actief
       and ad.soort = 'maaltijd'
       and extract(isodow from dg.dag)::smallint = any(ad.dagen)
  )
  select c.afdeling,
         c.titel,
         count(*) filter (where c.o_bron <> 'uitstap'),
         count(*) filter (where c.o_bron = 'team'),
         count(*) filter (where c.o_bron <> 'uitstap' and c.o_status = 'gegeten'),
         count(*) filter (where c.o_bron <> 'uitstap' and c.o_status = 'half'),
         count(*) filter (where c.o_bron <> 'uitstap' and c.o_status = 'niet')
    from cel c
   group by c.moment_id, c.afdeling, c.titel
   order by c.afdeling, c.titel;
end;
$$;

revoke execute on function public.maaltijd_analyse_stand(uuid, date, date) from public, anon;
grant execute on function public.maaltijd_analyse_stand(uuid, date, date) to authenticated, service_role;
