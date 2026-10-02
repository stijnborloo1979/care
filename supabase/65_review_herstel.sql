-- =====================================================================
--  LIFEANGLE — herstellingen na de onafhankelijke review van 60–64
--  Supabase migratie, versie 65
--
--  Draai dit na 64_opruimen.sql.
--  Terugdraaien: supabase/rollback/65_review_herstel.sql
--  Tests: supabase/tests/test_65_review.sql
--
--  1. HOOG — een org admin kon zichzelf team lead maken
--     Bestaand: de policy department_staff_write (52) liet de org admin elke
--     rij invoegen, ook zichzelf als team lead. toegewezen() (53) gaf hem
--     dan toegang tot alle bewoners van die afdeling, en zet_verblijf (60)
--     liet hem elke bewoner naar die afdeling verhuizen. Dat brak J4.
--     Voorgesteld: een trigger op department_staff laat alleen actieve
--     coördinatoren en zorgmedewerkers van die organisatie toe, en nooit
--     jezelf. Zelfde regel als care_assignment_controle (53). Bestaande
--     rijen van org admins worden beëindigd.
--     Daarbij: niemand past zijn eigen rol of actief-vlag in de organisatie
--     aan (anders: zichzelf eerst coördinator maken).
--
--  2. MIDDEL — een team lead uit dienst kon nog toewijzen
--     mag_toewijzen (60) keek niet naar org_membership.active.
--
--  3. LAAG/MIDDEL — elke medewerker kon de koppelcode lezen
--     De policy organisation_read (03) gaf alle kolommen aan alle staff.
--     Voorgesteld: lezen en aanpassen per kolom; koppelcode en de
--     bewaartermijnen alleen via de functies (60–63).
--
--  4. LAAG — een koppelcode kon geraden of afgetoetst worden
--     Voorgesteld: koppel_met_wzc telt mislukte pogingen; na 10 per uur per
--     gebruiker weigert ze. Een onbekende code geeft geen fout meer maar
--     null terug, zodat de poging bewaard blijft (een fout zou ze mee
--     terugdraaien). De app toont dan dezelfde uitleg als voorheen.
--     En: een beheerder zet de koppelcode niet meer rechtstreeks, alleen
--     via nieuwe_koppelcode.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.mag_toewijzen(uuid)') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;


-- 1. ------------------------------------------------------------------

-- Geen security definer: zo weet de functie of een gebruiker van de app
-- (rol authenticated) dit doet, of de server. De rol-regel geldt voor
-- iedereen, de "niet jezelf"-regel alleen voor gebruikers van de app.
create or replace function public.afdeling_controle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  org uuid;
begin
  select org_id into org from public.department where id = new.department_id;
  if not exists (
    select 1 from public.org_membership
     where org_id = org and profile_id = new.profile_id and active
       and role in ('coordinator', 'caregiver')
  ) then
    raise exception 'Alleen een coördinator of zorgmedewerker van deze organisatie kan op een afdeling staan'
      using errcode = '42501';
  end if;
  if current_user = 'authenticated' and new.profile_id = auth.uid() then
    raise exception 'Je kan jezelf niet op een afdeling zetten' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.afdeling_controle() from public, anon, authenticated;

drop trigger if exists department_staff_controle on public.department_staff;
create trigger department_staff_controle
  before insert or update of profile_id, department_id, role on public.department_staff
  for each row execute function public.afdeling_controle();

create or replace function public.eigen_rol_controle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and new.profile_id = auth.uid()
     and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'Je kan je eigen rol in de organisatie niet aanpassen' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.eigen_rol_controle() from public, anon, authenticated;

drop trigger if exists org_membership_eigen_rol on public.org_membership;
create trigger org_membership_eigen_rol
  before update on public.org_membership
  for each row execute function public.eigen_rol_controle();

-- Bestaande rijen van een org admin op een afdeling: beëindigen.
do $$
declare
  n integer;
begin
  update public.department_staff ds
     set valid_until = greatest(ds.valid_from, now())
    from public.department d, public.org_membership om
   where d.id = ds.department_id
     and om.org_id = d.org_id and om.profile_id = ds.profile_id
     and om.role = 'org_admin'
     and (ds.valid_until is null or ds.valid_until > now());
  get diagnostics n = row_count;
  if n > 0 then
    raise notice '% afdelingsrij(en) van een org admin beëindigd', n;
  end if;
end
$$;


-- 2. ------------------------------------------------------------------

create or replace function public.mag_toewijzen(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stay s
     where s.household_id = hh and s.ended_at is null
       and (coalesce(public.org_role_of(s.org_id)::text, '') in ('org_admin', 'coordinator')
            or exists (
              select 1 from public.department_staff ds
                join public.org_membership om on om.org_id = s.org_id and om.profile_id = ds.profile_id and om.active
               where ds.department_id = s.department_id and ds.profile_id = auth.uid()
                 and ds.role = 'team_lead' and ds.valid_from <= now()
                 and (ds.valid_until is null or ds.valid_until > now()))));
$$;


-- 3. ------------------------------------------------------------------

revoke select, update on public.organisation from authenticated;
grant select (id, name, contact_email, vat_number, active, created_at) on public.organisation to authenticated;
grant update (name, contact_email, vat_number) on public.organisation to authenticated;


-- 4. ------------------------------------------------------------------

create table if not exists public.koppel_poging (
  profile_id  uuid not null references public.profile (id) on delete cascade,
  at          timestamptz not null default now()
);
create index if not exists koppel_poging_idx on public.koppel_poging (profile_id, at desc);
alter table public.koppel_poging enable row level security;
revoke all on public.koppel_poging from anon, authenticated;

comment on table public.koppel_poging is
  'Mislukte pogingen om met een koppelcode te koppelen. Alleen voor de grens van 10 per uur; wordt na een dag opgeruimd.';

create or replace function public.koppel_met_wzc(hh uuid, code text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.organisation;
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan een huishouden koppelen' using errcode = '42501';
  end if;

  delete from public.koppel_poging where at < now() - interval '1 day';
  if (select count(*) from public.koppel_poging
       where profile_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Te veel pogingen. Probeer het over een uur opnieuw.' using errcode = '42501';
  end if;

  select * into o from public.organisation
   where koppelcode = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) and active;
  if o.id is null then
    -- Geen fout: die zou de poging mee terugdraaien. De app toont de uitleg.
    insert into public.koppel_poging (profile_id) values (auth.uid());
    return null;
  end if;
  perform public.link_household_to_org(hh, o.id);
  return o.name;
end;
$$;

revoke execute on function public.koppel_met_wzc(uuid, text) from public, anon;
grant execute on function public.koppel_met_wzc(uuid, text) to authenticated, service_role;
