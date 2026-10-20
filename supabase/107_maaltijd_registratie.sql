-- =====================================================================
--  LIFEANGLE Care — maaltijden per bewoner: gegeten, half, niet
--  Supabase migratie, versie 107
--
--  Draai dit na 106_uitstap_maaltijd.sql.
--  Terugdraaien: supabase/rollback/107_maaltijd_registratie.sql
--  Tests: supabase/tests/test_107_maaltijd_registratie.sql
--
--  BESTAAND   het team weet niet wat een bewoner gegeten heeft; het WZC
--             ziet niet welke maaltijden niet worden gegeten.
--  VOORGESTELD per bewoner, per maaltijd van de vaste dag, per dag:
--             gegeten / half / niet, met een korte notitie.
--  REDEN      minder dubbel werk op de afdeling en een cijfer voor de
--             analyse (welke maaltijden blijven staan).
--  RISICO     laag. Nieuwe tabel; de bestaande vaste dag en uitstappen
--             veranderen niet.
--
--  Wie mag wat
--  -----------
--    registreren   het toegewezen team of een medewerker van de afdeling
--                  van de bewoner, via maaltijd_zet(). Alleen vandaag of
--                  gisteren, en alleen een maaltijd van de vaste dag.
--    lezen         wie mag registreren, direct (niet via RPC).
--    analyse       alle medewerkers van de organisatie zien alleen
--                  geaggregeerde cijfers (maaltijd_analyse()), geen namen.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.toegewezen(uuid)') is null or to_regprocedure('public.huidige_org(uuid)') is null then
    raise exception 'Draai eerst 59_zorg.sql en 70_medewerkers_beheren.sql';
  end if;
  if to_regclass('public.afdeling_dag') is null then
    raise exception 'Draai eerst 78_dag_van_de_afdeling.sql';
  end if;
end
$$;

create table if not exists public.maaltijd_registratie (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organisation (id) on delete cascade,
  household_id        uuid not null references public.household (id) on delete cascade,
  afdeling_dag_id     uuid not null references public.afdeling_dag (id) on delete cascade,
  dag                 date not null,
  status              text not null check (status in ('gegeten', 'half', 'niet')),
  notitie             text check (notitie is null or char_length(notitie) <= 200),
  geregistreerd_door  uuid references public.profile (id) on delete set null default auth.uid(),
  geregistreerd_at    timestamptz not null default now(),
  unique (household_id, afdeling_dag_id, dag)
);
create index if not exists maaltijd_reg_org_dag_idx on public.maaltijd_registratie (org_id, dag);

comment on table public.maaltijd_registratie is
  'Wat een bewoner bij een maaltijd van de vaste dag heeft gegeten: gegeten, half of niet. Eén rij per bewoner, maaltijd en dag.';

alter table public.maaltijd_registratie enable row level security;

revoke all on public.maaltijd_registratie from anon;
revoke insert, update, delete, truncate on public.maaltijd_registratie from authenticated;
grant select on public.maaltijd_registratie to authenticated;

-- Mag ik deze bewoner een maaltijd registreren? Het toegewezen team, of
-- een medewerker van de afdeling waar de bewoner op dit moment verblijft.
create or replace function public.mag_maaltijd(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.toegewezen(hh) or exists (
    select 1
      from public.stay s
      join public.department_staff ds
        on ds.department_id = s.department_id
       and ds.profile_id = auth.uid()
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
     where s.household_id = hh
       and s.ended_at is null
  );
$$;

revoke execute on function public.mag_maaltijd(uuid) from public, anon;
grant execute on function public.mag_maaltijd(uuid) to authenticated, service_role;

drop policy if exists maaltijd_reg_team_read on public.maaltijd_registratie;
create policy maaltijd_reg_team_read on public.maaltijd_registratie for select
  using (org_id = public.huidige_org(household_id) and public.mag_maaltijd(household_id));

-- Registreren of corrigeren (de laatste keuze telt).
create or replace function public.maaltijd_zet(
  p_household uuid,
  p_moment uuid,
  p_dag date,
  p_status text,
  p_notitie text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ad public.afdeling_dag;
  org uuid := public.huidige_org(p_household);
  vandaag date := (now() at time zone 'Europe/Brussels')::date;
  id uuid;
begin
  if auth.uid() is null or org is null or not public.mag_maaltijd(p_household) then
    raise exception 'Deze bewoner vind ik niet' using errcode = '42501';
  end if;
  select * into ad from public.afdeling_dag where afdeling_dag.id = p_moment and afdeling_dag.org_id = org;
  if not found or ad.soort <> 'maaltijd' then
    raise exception 'Dat is geen maaltijd van dit huis' using errcode = '22023';
  end if;
  if p_dag > vandaag or p_dag < vandaag - 1 then
    raise exception 'Je kunt alleen van vandaag of gisteren registreren' using errcode = '22023';
  end if;
  if p_status not in ('gegeten', 'half', 'niet') then
    raise exception 'Onbekende keuze' using errcode = '22023';
  end if;

  insert into public.maaltijd_registratie (org_id, household_id, afdeling_dag_id, dag, status, notitie, geregistreerd_door)
  values (org, p_household, p_moment, p_dag, p_status, nullif(btrim(p_notitie), ''), auth.uid())
  on conflict (household_id, afdeling_dag_id, dag) do update
    set status = excluded.status,
        notitie = excluded.notitie,
        geregistreerd_door = excluded.geregistreerd_door,
        geregistreerd_at = now()
  returning maaltijd_registratie.id into id;
  return id;
end;
$$;

revoke execute on function public.maaltijd_zet(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.maaltijd_zet(uuid, uuid, date, text, text) to authenticated, service_role;

-- Analyse voor het WZC: per afdeling en maaltijd, over een periode.
-- Alleen aantallen. Een bewoner op uitstap zonder eten telt niet mee.
create or replace function public.maaltijd_analyse(p_org uuid, p_van date, p_tot date)
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
  maaltijden as (
    select ad.id as moment_id,
           coalesce(dep.name, 'Hele huis') as afdeling,
           ad.titel,
           ad.department_id,
           ad.begint,
           ad.dagen
      from public.afdeling_dag ad
      left join public.department dep on dep.id = ad.department_id
     where ad.org_id = p_org and ad.actief and ad.soort = 'maaltijd'
  ),
  verwacht as (
    select m.moment_id, m.afdeling, m.titel, s.household_id, dg.dag,
           (dg.dag + m.begint) at time zone 'Europe/Brussels' as tijdstip
      from maaltijden m
      cross join dagen dg
      join public.stay s
        on s.org_id = p_org
       and (m.department_id is null or s.department_id = m.department_id)
       and s.started_at < (dg.dag + 1)
       and (s.ended_at is null or s.ended_at >= dg.dag)
     where extract(isodow from dg.dag)::smallint = any(m.dagen)
       -- op uitstap zonder eten mee: die maaltijd vervalt, dus telt niet
       and not exists (
         select 1 from public.uitstap u
          where u.household_id = s.household_id
            and u.status <> 'geannuleerd'
            and not u.eet_mee
            and (dg.dag + m.begint) at time zone 'Europe/Brussels' >= u.vertrek
            and (dg.dag + m.begint) at time zone 'Europe/Brussels' <= u.terug)
  )
  select v.afdeling,
         v.titel,
         count(*),
         count(r.id),
         count(r.id) filter (where r.status = 'gegeten'),
         count(r.id) filter (where r.status = 'half'),
         count(r.id) filter (where r.status = 'niet')
    from verwacht v
    left join public.maaltijd_registratie r
      on r.afdeling_dag_id = v.moment_id
     and r.household_id = v.household_id
     and r.dag = v.dag
   group by v.moment_id, v.afdeling, v.titel
   order by v.afdeling, v.titel;
end;
$$;

revoke execute on function public.maaltijd_analyse(uuid, date, date) from public, anon;
grant execute on function public.maaltijd_analyse(uuid, date, date) to authenticated, service_role;
