-- =====================================================================
--  LIFEANGLE Care — medewerkers beheren
--  Supabase migratie, versie 70
--
--  Draai dit na 69_anon_dicht.sql.
--  Terugdraaien: supabase/rollback/70_medewerkers_beheren.sql
--  Tests: supabase/tests/test_70_medewerkers_beheren.sql
--
--  1. Rol wijzigen of uit dienst zetten laat geen toegang achter
--     BESTAAND   de beheerder kon al de rol of de actief-vlag van een
--                medewerker aanpassen (policy org_membership_admin, 03).
--                Maar een team lead die beheerder werd, bleef team lead op
--                zijn afdeling, en een toegewezen medewerker die beheerder
--                werd, bleef toegewezen. toegewezen() (53) kijkt naar
--                "actief", niet naar de rol: zo kon een beheerder toch
--                inhoud zien. Dat breekt J4.
--     VOORGESTELD wordt iemand beheerder, of gaat hij uit dienst, dan
--                eindigen zijn afdelingsplaatsen en toewijzingen in die
--                organisatie meteen (trigger). Bestaande gevallen worden nu
--                ook beëindigd.
--     RISICO     laag: terug in dienst zetten herstelt de toewijzingen
--                niet. Dat is bewust: dan beslist iemand opnieuw wie wie
--                volgt. Het overzicht in Beheer toont wie niemand meer volgt.
--
--  2. Uitnodigingen intrekken en verlengen
--     BESTAAND   een uitnodiging bleef 14 dagen geldig; intrekken kon alleen
--                rechtstreeks in de tabel, zonder scherm.
--     VOORGESTELD trek_uitnodiging_in() en verleng_uitnodiging() voor de
--                beheerder. Verlengen geeft 14 nieuwe dagen; daarna kan de
--                app de mail opnieuw sturen.
-- =====================================================================

do $$
begin
  if to_regclass('public.org_invitation') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;


-- 1. ------------------------------------------------------------------

create or replace function public.medewerker_gevolg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role = 'org_admin' and old.role is distinct from 'org_admin')
     or (not new.active and old.active) then
    update public.department_staff ds
       set valid_until = greatest(ds.valid_from, now())
      from public.department d
     where d.id = ds.department_id and d.org_id = new.org_id
       and ds.profile_id = new.profile_id
       and (ds.valid_until is null or ds.valid_until > now());
    update public.care_assignment ca
       set valid_until = greatest(ca.valid_from, now()),
           reason = coalesce(ca.reason, case when new.active then 'rol gewijzigd' else 'uit dienst' end)
      from public.stay s
     where s.id = ca.stay_id and s.org_id = new.org_id
       and ca.profile_id = new.profile_id
       and (ca.valid_until is null or ca.valid_until > now());
  end if;
  return new;
end;
$$;

revoke execute on function public.medewerker_gevolg() from public, anon, authenticated;

drop trigger if exists org_membership_gevolg on public.org_membership;
create trigger org_membership_gevolg
  after update of role, active on public.org_membership
  for each row execute function public.medewerker_gevolg();

-- Bestaande gevallen: een beheerder of iemand uit dienst met nog een
-- toewijzing of afdelingsplaats.
do $$
declare
  n1 integer;
  n2 integer;
begin
  update public.department_staff ds
     set valid_until = greatest(ds.valid_from, now())
    from public.department d, public.org_membership om
   where d.id = ds.department_id
     and om.org_id = d.org_id and om.profile_id = ds.profile_id
     and (om.role = 'org_admin' or not om.active)
     and (ds.valid_until is null or ds.valid_until > now());
  get diagnostics n1 = row_count;
  update public.care_assignment ca
     set valid_until = greatest(ca.valid_from, now())
    from public.stay s, public.org_membership om
   where s.id = ca.stay_id
     and om.org_id = s.org_id and om.profile_id = ca.profile_id
     and (om.role = 'org_admin' or not om.active)
     and (ca.valid_until is null or ca.valid_until > now());
  get diagnostics n2 = row_count;
  if n1 + n2 > 0 then
    raise notice '% afdelingsplaats(en) en % toewijzing(en) van een beheerder of iemand uit dienst beëindigd', n1, n2;
  end if;
end
$$;


-- 2. ------------------------------------------------------------------

create or replace function public.trek_uitnodiging_in(uitnodiging uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  i public.org_invitation;
begin
  select * into i from public.org_invitation where id = uitnodiging;
  if i.id is null or public.org_role_of(i.org_id) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  if i.accepted_at is not null then
    raise exception 'Deze uitnodiging is al aanvaard' using errcode = '22023';
  end if;
  update public.org_invitation set revoked_at = coalesce(revoked_at, now()) where id = uitnodiging;
end;
$$;

create or replace function public.verleng_uitnodiging(uitnodiging uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  i public.org_invitation;
  tot timestamptz := now() + interval '14 days';
begin
  select * into i from public.org_invitation where id = uitnodiging;
  if i.id is null or public.org_role_of(i.org_id) is distinct from 'org_admin' then
    raise exception 'Alleen de beheerder van de organisatie' using errcode = '42501';
  end if;
  if i.accepted_at is not null then
    raise exception 'Deze uitnodiging is al aanvaard' using errcode = '22023';
  end if;
  if i.revoked_at is not null then
    raise exception 'Deze uitnodiging is ingetrokken. Maak een nieuwe.' using errcode = '22023';
  end if;
  update public.org_invitation set expires_at = tot where id = uitnodiging;
  return tot;
end;
$$;

revoke execute on function public.trek_uitnodiging_in(uuid) from public, anon;
revoke execute on function public.verleng_uitnodiging(uuid) from public, anon;
grant execute on function public.trek_uitnodiging_in(uuid) to authenticated;
grant execute on function public.verleng_uitnodiging(uuid) to authenticated;
