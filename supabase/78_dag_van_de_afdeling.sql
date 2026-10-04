-- =====================================================================
--  LIFEANGLE Care — de dag van de afdeling, op elke tablet
--  Supabase migratie, versie 78
--
--  Draai dit na 77_prijzen.sql (en na 59_zorg.sql, 68_bericht_zorgteam.sql).
--  Terugdraaien: supabase/rollback/78_dag_van_de_afdeling.sql
--  Tests: supabase/tests/test_78_dag_van_de_afdeling.sql
--
--  BESTAAND   het WZC kon losse activiteiten plannen (59), maar de vaste
--             dag (ontbijt, middagmaal, rust, koffie) stond nergens. Op de
--             tablet van een bewoner stond alleen wat de familie in de
--             agenda zette; de activiteiten van het huis kwamen er niet op.
--  VOORGESTELD afdeling_dag: de vaste dag van een afdeling (of van het hele
--             huis), per weekdag. dag_van_bewoner(hh, dag) geeft voor één
--             bewoner de vaste dag van haar afdeling plus de activiteiten
--             van die dag, met haar eigen deelname (aanwezig/afwezig). De
--             tablet, de familie en de spraakassistent lezen alleen via
--             deze functie.
--  REDEN      één planning door het WZC, automatisch op elke tablet van de
--             afdeling; de familie ziet wat mama vandaag deed.
--  RISICO     laag. Nieuwe tabel en functie; activity en
--             activity_participant (59) veranderen niet.
--
--  Wie mag wat
--  -----------
--    afdeling_dag  lezen: medewerkers van de organisatie (is_org_staff);
--                  beheren: org admin en coördinator overal, een team lead
--                  alleen voor zijn eigen afdeling. Geen bewonersinhoud.
--    aanwezigheid  "aanwezig" of "afwezig" bij een activiteit zet alleen het
--                  zorgteam (toegewezen). Familie en bewoner kunnen nog
--                  inschrijven (59), maar niet zelf "was erbij" invullen:
--                  het dagverhaal zegt dat het team het aanduidde.
--    dag_van_bewoner  wie de agenda van die bewoner mag lezen
--                  (can_legacy agenda.read: de bewoner, familie met dat
--                  recht, het toegewezen zorgteam). Anderen krijgen niets.
--                  Alleen tijdens een open verblijf, en alleen voor een dag
--                  binnen dat verblijf (tot 7 dagen vooruit).
-- =====================================================================

do $$
begin
  if to_regclass('public.activity') is null then
    raise exception 'Draai eerst 59_zorg.sql';
  end if;
  if to_regprocedure('public.can_legacy(uuid, text)') is null then
    raise exception 'Draai eerst 49_can_legacy.sql';
  end if;
end
$$;

create table if not exists public.afdeling_dag (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisation (id) on delete cascade,
  department_id  uuid references public.department (id) on delete cascade,
  titel          text not null check (char_length(btrim(titel)) between 1 and 80),
  soort          text not null default 'andere' check (soort in ('maaltijd', 'rust', 'activiteit', 'verzorging', 'andere')),
  emoji          text check (emoji is null or char_length(emoji) <= 8),
  begint         time not null,
  eindigt        time,
  dagen          smallint[] not null default '{1,2,3,4,5,6,7}',
  actief         boolean not null default true,
  created_by     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint afdeling_dag_tijd check (eindigt is null or eindigt > begint),
  constraint afdeling_dag_dagen check (cardinality(dagen) between 1 and 7 and dagen <@ '{1,2,3,4,5,6,7}'::smallint[])
);
create index if not exists afdeling_dag_org_idx on public.afdeling_dag (org_id, department_id);

comment on table public.afdeling_dag is
  'De vaste dag van een afdeling (of van het hele huis als department_id leeg is). dagen: 1 = maandag … 7 = zondag.';

alter table public.afdeling_dag enable row level security;

drop policy if exists afdeling_dag_read on public.afdeling_dag;
create policy afdeling_dag_read on public.afdeling_dag for select
  using (public.is_org_staff(org_id));

-- Beheerder en coördinator: elke afdeling en het hele huis. Een team lead:
-- alleen de afdeling(en) waar hij nu team lead is.
create or replace function public.mag_afdeling_plannen(org uuid, dep uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.org_role_of(org) in ('org_admin', 'coordinator')
    or (dep is not null and exists (
          select 1
            from public.department_staff ds
            join public.department d on d.id = ds.department_id
            join public.org_membership om on om.org_id = d.org_id and om.profile_id = ds.profile_id
           where ds.department_id = dep and d.org_id = org
             and ds.profile_id = auth.uid()
             and ds.role = 'team_lead'
             and ds.valid_from <= now()
             and (ds.valid_until is null or ds.valid_until > now())
             and om.active and om.role in ('coordinator', 'caregiver'))));
$$;

revoke execute on function public.mag_afdeling_plannen(uuid, uuid) from public, anon;
grant execute on function public.mag_afdeling_plannen(uuid, uuid) to authenticated, service_role;

drop policy if exists afdeling_dag_write on public.afdeling_dag;
create policy afdeling_dag_write on public.afdeling_dag for all
  using (public.mag_afdeling_plannen(org_id, department_id))
  with check (public.mag_afdeling_plannen(org_id, department_id));

revoke all on public.afdeling_dag from anon;
grant select, insert, update, delete on public.afdeling_dag to authenticated;

-- De afdeling hoort bij dezelfde organisatie; org_id en created_by liggen vast.
create or replace function public.afdeling_dag_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.department_id is not null
     and not exists (select 1 from public.department where id = new.department_id and org_id = new.org_id) then
    raise exception 'Die afdeling hoort niet bij deze organisatie' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.afdeling_dag_check() from public, anon, authenticated;

drop trigger if exists afdeling_dag_check on public.afdeling_dag;
create trigger afdeling_dag_check before insert or update on public.afdeling_dag
  for each row execute function public.afdeling_dag_check();

-- Ook een activiteit (59) kan niet naar de afdeling van een ander huis wijzen.
create or replace function public.activity_afdeling_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.department_id is not null
     and not exists (select 1 from public.department where id = new.department_id and org_id = new.org_id) then
    raise exception 'Die afdeling hoort niet bij deze organisatie' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.activity_afdeling_check() from public, anon, authenticated;

drop trigger if exists activity_afdeling_check on public.activity;
create trigger activity_afdeling_check before insert or update of department_id, org_id on public.activity
  for each row execute function public.activity_afdeling_check();


-- De dag van één bewoner: de vaste dag van haar afdeling en de activiteiten.
--   bron      'vast' (afdeling_dag) of 'activiteit' (activity)
--   deelname  alleen bij een activiteit: ingeschreven, aanwezig, afwezig
--   status    alleen bij een activiteit: gepland, geannuleerd, afgelopen
create or replace function public.dag_van_bewoner(hh uuid, dag date default null)
returns table (
  bron      text,
  id        uuid,
  titel     text,
  soort     text,
  emoji     text,
  begint    timestamptz,
  eindigt   timestamptz,
  plaats    text,
  status    text,
  deelname  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz   text;
  d    date;
  v    record;
begin
  if auth.uid() is null or not public.can_legacy(hh, 'agenda.read') then
    return;
  end if;
  select s.org_id, s.department_id, s.started_at into v
    from public.stay s where s.household_id = hh and s.ended_at is null;
  if not found then
    return;
  end if;
  select coalesce(h.timezone, 'Europe/Brussels') into tz from public.household h where h.id = hh;
  d := coalesce(dag, (now() at time zone tz)::date);
  -- Alleen dagen van dit verblijf, niet van een vroeger verblijf of ver vooruit.
  if d < (v.started_at at time zone tz)::date or d > (now() at time zone tz)::date + 7 then
    return;
  end if;

  return query
    select 'vast'::text, a.id, a.titel, a.soort, a.emoji,
           (d + a.begint) at time zone tz,
           case when a.eindigt is null then null else (d + a.eindigt) at time zone tz end,
           null::text, null::text, null::text
      from public.afdeling_dag a
     where a.org_id = v.org_id
       and a.actief
       and (a.department_id is null or a.department_id = v.department_id)
       and extract(isodow from d)::smallint = any (a.dagen)
    union all
    select 'activiteit'::text, x.id, x.titel, 'activiteit'::text, null::text,
           x.starts_at, x.ends_at, x.plaats, x.status, p.status
      from public.activity x
      left join public.activity_participant p on p.activity_id = x.id and p.household_id = hh
     where x.org_id = v.org_id
       and (x.department_id is null or x.department_id = v.department_id)
       and x.starts_at >= (d::timestamp at time zone tz)
       and x.starts_at <  ((d + 1)::timestamp at time zone tz)
     order by 6, 3;
end;
$$;

revoke execute on function public.dag_van_bewoner(uuid, date) from public, anon;
grant execute on function public.dag_van_bewoner(uuid, date) to authenticated, service_role;


-- Aanwezigheid: alleen het zorgteam zet "aanwezig" of "afwezig" (ook bij het
-- inschrijven). De server (beheer, tests) mag wel.
create or replace function public.deelname_status_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and new.status is distinct from 'ingeschreven'
     and not public.toegewezen(new.household_id) then
    raise exception 'Alleen het zorgteam duidt aanwezigheid aan' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.deelname_status_check() from public, anon, authenticated;

drop trigger if exists deelname_status_check on public.activity_participant;
create trigger deelname_status_check before insert on public.activity_participant
  for each row execute function public.deelname_status_check();
