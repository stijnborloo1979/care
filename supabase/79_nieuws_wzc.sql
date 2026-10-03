-- =====================================================================
--  LIFEANGLE Care — nieuws van het woonzorgcentrum voor de families
--  Supabase migratie, versie 79
--
--  Draai dit na 78_dag_van_de_afdeling.sql.
--  Terugdraaien: supabase/rollback/79_nieuws_wzc.sql
--  Tests: supabase/tests/test_79_nieuws_wzc.sql
--
--  BESTAAND   het WZC bereikte families via papier, mail of telefoon.
--  VOORGESTELD org_nieuws: één bericht van het WZC aan alle families, of aan
--             de families van één afdeling. Het staat in de familie-app,
--             duidelijk als "van het woonzorgcentrum".
--  REDEN      minder telefoons, iedereen tegelijk op de hoogte.
--  RISICO     laag. Nieuwe tabel. Een nieuwsbericht hangt aan geen enkele
--             bewoner (geen household_id): het kan geen bewonersinhoud
--             dragen via de structuur. De app vraagt de schrijver uitdrukkelijk
--             niets over één bewoner te schrijven.
--
--  Wie mag wat
--  -----------
--    schrijven  org admin en coördinator: aan iedereen of één afdeling;
--               team lead: alleen aan een afdeling waar hij team lead is
--    lezen      de medewerkers van de organisatie; de familie en de bewoner
--               met een open verblijf in die organisatie (en, bij een
--               afdelingsbericht, op die afdeling)
--    aanpassen  niemand: een correctie is een nieuw bericht
--    wissen     de schrijver, of de org admin
--    bewaren    180 dagen; daarna ruimt nieuws_opruimen() op (03:40)
-- =====================================================================

do $$
begin
  if to_regprocedure('public.werkt_op_afdeling(uuid)') is null then
    raise exception 'Draai eerst 52_stays.sql en 70_medewerkers_beheren.sql';
  end if;
end
$$;

create table if not exists public.org_nieuws (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisation (id) on delete cascade,
  department_id  uuid references public.department (id) on delete cascade,
  titel          text not null check (char_length(btrim(titel)) between 1 and 120),
  tekst          text not null check (char_length(btrim(tekst)) between 1 and 2000),
  author_id      uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists org_nieuws_org_idx on public.org_nieuws (org_id, created_at desc);

comment on table public.org_nieuws is
  'Nieuws van het woonzorgcentrum aan de families: aan iedereen of aan één afdeling. Nooit over één bewoner.';

-- Mag ik in deze organisatie (en voor deze afdeling) nieuws schrijven?
create or replace function public.mag_nieuws_schrijven(org uuid, dep uuid)
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

revoke execute on function public.mag_nieuws_schrijven(uuid, uuid) from public, anon;
grant execute on function public.mag_nieuws_schrijven(uuid, uuid) to authenticated, service_role;

-- Mag ik dit nieuws lezen? Medewerkers, of wie een band heeft met een
-- bewoner die er nu woont (op die afdeling).
create or replace function public.mag_nieuws_lezen(org uuid, dep uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_org_staff(org)
    or exists (
      select 1 from public.stay s
       where s.org_id = org and s.ended_at is null
         and (dep is null or s.department_id = dep)
         and (public.is_bewoner(s.household_id) or public.family_role(s.household_id) is not null)));
$$;

revoke execute on function public.mag_nieuws_lezen(uuid, uuid) from public, anon;
grant execute on function public.mag_nieuws_lezen(uuid, uuid) to authenticated, service_role;

alter table public.org_nieuws enable row level security;

drop policy if exists org_nieuws_read on public.org_nieuws;
create policy org_nieuws_read on public.org_nieuws for select
  using (public.mag_nieuws_lezen(org_id, department_id));

drop policy if exists org_nieuws_insert on public.org_nieuws;
create policy org_nieuws_insert on public.org_nieuws for insert
  with check (author_id = auth.uid() and public.mag_nieuws_schrijven(org_id, department_id));

drop policy if exists org_nieuws_delete on public.org_nieuws;
create policy org_nieuws_delete on public.org_nieuws for delete
  using (author_id = auth.uid() or public.org_role_of(org_id) = 'org_admin');

revoke all on public.org_nieuws from anon;
revoke update, truncate on public.org_nieuws from authenticated;
grant select, insert, delete on public.org_nieuws to authenticated;

-- De afdeling hoort bij de organisatie; de tijd komt van de server.
create or replace function public.org_nieuws_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Altijd de servertijd: zo blijft een bericht niet eeuwig bovenaan staan
  -- en ontsnapt het niet aan het opruimen. (Een definer-functie ziet
  -- current_user als eigenaar, dus geen uitzondering op de rol.)
  new.created_at := now();
  if new.department_id is not null
     and not exists (select 1 from public.department where id = new.department_id and org_id = new.org_id) then
    raise exception 'Die afdeling hoort niet bij deze organisatie' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.org_nieuws_check() from public, anon, authenticated;

drop trigger if exists org_nieuws_check on public.org_nieuws;
create trigger org_nieuws_check before insert on public.org_nieuws
  for each row execute function public.org_nieuws_check();

-- Het nieuws voor één bewoner en haar familie, met de afzender in woorden.
create or replace function public.nieuws_voor(hh uuid)
returns table (
  id          uuid,
  titel       text,
  tekst       text,
  van         text,
  afdeling    text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.titel, n.tekst, o.name, d.name, n.created_at
    from public.stay s
    join public.organisation o on o.id = s.org_id
    join public.org_nieuws n on n.org_id = s.org_id
                            and (n.department_id is null or n.department_id = s.department_id)
    left join public.department d on d.id = n.department_id
   where s.household_id = hh and s.ended_at is null
     and auth.uid() is not null
     and (public.is_bewoner(hh) or public.family_role(hh) is not null)
     and n.created_at > now() - interval '180 days'
   order by n.created_at desc
   limit 20;
$$;

revoke execute on function public.nieuws_voor(uuid) from public, anon;
grant execute on function public.nieuws_voor(uuid) to authenticated, service_role;

-- Opruimen na 180 dagen.
create or replace function public.nieuws_opruimen()
returns integer
language sql
security definer
set search_path = public
as $$
  with weg as (delete from public.org_nieuws where created_at < now() - interval '180 days' returning 1)
  select count(*)::integer from weg;
$$;

revoke execute on function public.nieuws_opruimen() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('nieuws-opruimen', '40 3 * * *', 'select public.nieuws_opruimen()');
exception when others then
  raise notice 'pg_cron niet beschikbaar: plan nieuws_opruimen() zelf in.';
end
$$;
