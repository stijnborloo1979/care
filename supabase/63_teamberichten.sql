-- =====================================================================
--  LIFEANGLE Care — teamberichten per afdeling
--  Supabase migratie, versie 63
--
--  Draai dit na 62_overdracht_bewaren.sql.
--  Terugdraaien: supabase/rollback/63_teamberichten.sql
--  Tests: supabase/tests/test_63_teamberichten.sql
--
--  Nieuw, raakt niets bestaands
--  ----------------------------
--    team_message   korte berichten tussen medewerkers van één afdeling
--                   ("wie neemt de ronde van 14u over?")
--
--  Wie mag wat
--  -----------
--    lezen en schrijven  wie op de afdeling werkt (werkt_op_afdeling, 59)
--    wissen              alleen de schrijver, binnen 10 minuten (vergissing)
--    nooit               de org admin of coördinator zonder afdeling, familie,
--                        de bewoner; een teambericht is geen dossier
--    bewaren             per WZC instelbaar, standaard 30 dagen (J11);
--                        teambericht_opruimen() elke nacht om 03:30
-- =====================================================================

do $$
begin
  if to_regprocedure('public.werkt_op_afdeling(uuid)') is null then
    raise exception 'Draai eerst 59_zorg.sql';
  end if;
end
$$;

create table if not exists public.team_message (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.department (id) on delete cascade,
  body           text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id      uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists team_message_dept_idx on public.team_message (department_id, created_at desc);

comment on table public.team_message is
  'Korte berichten tussen medewerkers van één afdeling. Geen dossier: wat over een bewoner blijvend belangrijk is, hoort in een zorgnotitie.';

alter table public.team_message enable row level security;

drop policy if exists team_message_read on public.team_message;
create policy team_message_read on public.team_message for select
  using (public.werkt_op_afdeling(department_id));

drop policy if exists team_message_insert on public.team_message;
create policy team_message_insert on public.team_message for insert
  with check (public.werkt_op_afdeling(department_id) and author_id = auth.uid());

drop policy if exists team_message_delete on public.team_message;
create policy team_message_delete on public.team_message for delete
  using (author_id = auth.uid() and created_at > now() - interval '10 minutes');

revoke all on public.team_message from anon;
revoke update, truncate on public.team_message from authenticated;

-- De tijd komt altijd van de server: anders kan een bericht zich jonger
-- voordoen en zo langer wisbaar blijven.
create or replace function public.team_message_tijd()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists team_message_tijd on public.team_message;
create trigger team_message_tijd before insert on public.team_message
  for each row execute function public.team_message_tijd();

do $$
begin
  alter publication supabase_realtime add table public.team_message;
exception when others then null;
end
$$;


-- ---------------------------------------------------------------------
--  Bewaartermijn
-- ---------------------------------------------------------------------

alter table public.organisation
  add column if not exists teambericht_bewaar_dagen integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organisation_teambericht_bewaar_check') then
    alter table public.organisation add constraint organisation_teambericht_bewaar_check
      check (teambericht_bewaar_dagen between 7 and 365);
  end if;
end
$$;

create or replace function public.teambericht_termijn(org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select teambericht_bewaar_dagen from public.organisation
   where id = org and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

create or replace function public.teambericht_termijn_gevolg(org uuid, dagen integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.team_message m
    join public.department d on d.id = m.department_id
   where d.org_id = org
     and m.created_at < now() - make_interval(days => dagen)
     and public.org_role_of(org) = 'org_admin';
$$;

create or replace function public.zet_teambericht_termijn(org uuid, dagen integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.org_role_of(org) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  if dagen is null or dagen < 7 or dagen > 365 then
    raise exception 'Kies een termijn tussen 7 en 365 dagen' using errcode = '22023';
  end if;
  update public.organisation set teambericht_bewaar_dagen = dagen where id = org;
  return public.teambericht_termijn_gevolg(org, dagen);
end;
$$;

create or replace function public.teambericht_opruimen()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.team_message m
   using public.department d, public.organisation o
   where d.id = m.department_id
     and o.id = d.org_id
     and m.created_at < now() - make_interval(days => o.teambericht_bewaar_dagen);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.teambericht_opruimen() from public, anon, authenticated;
grant execute on function public.teambericht_opruimen() to service_role;
revoke execute on function public.team_message_tijd() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array['public.teambericht_termijn(uuid)', 'public.teambericht_termijn_gevolg(uuid, integer)',
                           'public.zet_teambericht_termijn(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;

do $$
begin
  perform cron.unschedule('teamberichten-opruimen');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('teamberichten-opruimen', '30 3 * * *', 'select public.teambericht_opruimen()');
exception when others then
  raise notice 'pg_cron staat nog niet aan. Zet de extensie aan en draai dit blok opnieuw.';
end
$$;
