-- =====================================================================
--  LIFEANGLE CARE: basis voor de spraakvraag (fase 3, eerste stap)
--
--  Draai na 103_zorg_taak_wijzigen.sql.
--
--  Standaard UIT. Er wordt hier geen spraakdienst aangeroepen en geen
--  audio opgeslagen. Dit legt alleen vast: schakelaars, een auditlog
--  met soort vraag (geen tekst), en een bewaartermijn van 30 dagen.
-- =====================================================================

alter table public.organisation
  add column if not exists spraak_lezen boolean not null default false;

alter table public.org_membership
  add column if not exists spraak_aan boolean not null default true;

create table if not exists public.spraak_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisation (id) on delete cascade,
  profile_id  uuid not null references public.profile (id) on delete cascade,
  soort       text not null check (soort in ('tijd_dienst', 'planning', 'open_taken', 'overig')),
  created_at  timestamptz not null default now()
);

create index if not exists spraak_log_tijd_idx on public.spraak_log (created_at);

comment on table public.spraak_log is
  'Auditlog van spraakvragen: soort vraag en tijdstip. Geen audio, geen tekst. Wordt na 30 dagen gewist.';

alter table public.spraak_log enable row level security;

drop policy if exists spraak_log_admin_read on public.spraak_log;
create policy spraak_log_admin_read on public.spraak_log for select
  using (public.org_role_of(org_id) = 'org_admin');

revoke all on public.spraak_log from anon, authenticated;
grant select on public.spraak_log to authenticated;

-- Registreert een vraag, maar alleen als de organisatie én de medewerker
-- het hebben aangezet. Geeft false terug als het uit staat: dan wordt er
-- niets vastgelegd en niets verstuurd.
create or replace function public.spraak_vraag_registreren(org uuid, soort text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.organisation o
      join public.org_membership m on m.org_id = o.id
     where o.id = org
       and o.spraak_lezen
       and m.profile_id = auth.uid()
       and m.active
       and m.spraak_aan
  ) then
    return false;
  end if;

  insert into public.spraak_log (org_id, profile_id, soort)
  values (org, auth.uid(), soort);
  return true;
end;
$$;

revoke execute on function public.spraak_vraag_registreren(uuid, text) from public, anon;
grant execute on function public.spraak_vraag_registreren(uuid, text) to authenticated, service_role;

-- Wist het auditlog ouder dan 30 dagen. Aan te roepen vanuit een geplande taak.
create or replace function public.spraak_log_opschonen()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.spraak_log where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.spraak_log_opschonen() from public, anon, authenticated;
grant execute on function public.spraak_log_opschonen() to service_role;
