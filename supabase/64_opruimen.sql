-- =====================================================================
--  LIFEANGLE — opruimen na de overgang, en wie volgt mijn familielid
--  Supabase migratie, versie 64
--
--  Draai dit na 63_teamberichten.sql.
--  Terugdraaien: supabase/rollback/64_opruimen.sql
--  Tests: supabase/tests/test_64_opruimen.sql
--
--  1. org_oversees() weg
--     Sinds 53 gebruikt geen enkele policy, functie, view of scherm ze nog
--     (nagekeken in pg_policies, pg_proc, pg_views en de broncode).
--
--  2. assign_caregiver() en unassign_caregiver() (03) omgeleid
--     Ze maakten van een medewerker een "lid" van het huishouden: een
--     tweede weg naast de toewijzing van 53, die de controle daarvan
--     omzeilde. Geen scherm gebruikt ze nog. Wie ze toch aanroept, gaat nu
--     via wijs_toe() en stop_toewijzing() (60). De familiebeheerder kan met
--     unassign_caregiver() nog altijd een zorgverlener-lid weghalen, zoals
--     voorheen.
--     Bestaande lidmaatschappen die zo ooit gemaakt zijn, blijven: ze
--     wegnemen zou iemand toegang afnemen zonder dat iemand het vroeg.
--
--  3. zorgteam(hh): wie van het WZC volgt mijn familielid
--     Voor de familie en de bewoner: naam en rol (toegewezen of team lead),
--     sinds wanneer. Geen e-mail of telefoon.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.wijs_toe(uuid, uuid)') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;


-- 1. ------------------------------------------------------------------
drop function if exists public.org_oversees(uuid);


-- 2. ------------------------------------------------------------------
create or replace function public.assign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Zelfde rechtencontrole en dezelfde regels als in het scherm (60, 53).
  perform public.wijs_toe(hh, caregiver);
end;
$$;

create or replace function public.unassign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  gedaan boolean := false;
begin
  -- Een toewijzing van het WZC stoppen (beheerder, coördinator, team lead).
  if public.mag_toewijzen(hh) then
    for t in
      select ca.id from public.care_assignment ca
        join public.stay s on s.id = ca.stay_id
       where s.household_id = hh and s.ended_at is null and ca.profile_id = caregiver
         and (ca.valid_until is null or ca.valid_until > now())
    loop
      perform public.stop_toewijzing(t.id);
      gedaan := true;
    end loop;
  end if;

  -- Een zorgverlener-lid weghalen: de familiebeheerder, zoals in 03.
  if public.family_role(hh) = 'admin' then
    delete from public.membership
     where household_id = hh and profile_id = caregiver and role = 'caregiver';
    gedaan := true;
  end if;

  if not gedaan then
    raise exception 'Geen recht om deze toewijzing te stoppen' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assign_caregiver(uuid, uuid) from public, anon;
revoke execute on function public.unassign_caregiver(uuid, uuid) from public, anon;
grant execute on function public.assign_caregiver(uuid, uuid) to authenticated;
grant execute on function public.unassign_caregiver(uuid, uuid) to authenticated;


-- 3. ------------------------------------------------------------------
create or replace function public.zorgteam(hh uuid)
returns table (naam text, rol text, sinds timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select s.id, s.department_id, s.org_id from public.stay s
     where s.household_id = hh and s.ended_at is null
  )
  select coalesce(nullif(btrim(p.full_name), ''), 'Een medewerker'), 'toegewezen', ca.valid_from
    from v
    join public.care_assignment ca on ca.stay_id = v.id
    join public.org_membership om on om.org_id = v.org_id and om.profile_id = ca.profile_id and om.active
    left join public.profile p on p.id = ca.profile_id
   where ca.valid_from <= now() and (ca.valid_until is null or ca.valid_until > now())
     and (public.family_role(hh) is not null or public.is_self(hh))
  union all
  select coalesce(nullif(btrim(p.full_name), ''), 'Een medewerker'), 'team lead', ds.valid_from
    from v
    join public.department_staff ds on ds.department_id = v.department_id and ds.role = 'team_lead'
    join public.org_membership om on om.org_id = v.org_id and om.profile_id = ds.profile_id and om.active
    left join public.profile p on p.id = ds.profile_id
   where ds.valid_from <= now() and (ds.valid_until is null or ds.valid_until > now())
     and (public.family_role(hh) is not null or public.is_self(hh))
   order by 2 desc, 1;
$$;

revoke execute on function public.zorgteam(uuid) from public, anon;
grant execute on function public.zorgteam(uuid) to authenticated, service_role;
