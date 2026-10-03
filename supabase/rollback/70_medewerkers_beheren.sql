-- Terugdraaien van 70_medewerkers_beheren.sql
-- Beëindigde afdelingsplaatsen en toewijzingen worden niet hersteld.
drop function if exists public.verleng_uitnodiging(uuid);
drop function if exists public.trek_uitnodiging_in(uuid);
drop trigger if exists org_membership_gevolg on public.org_membership;
drop function if exists public.medewerker_gevolg();

-- De versies van vóór 70 (53, 54, 59, 65).
create or replace function public.toegewezen(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- een persoonlijke toewijzing op het open verblijf
    select 1
      from public.stay s
      join public.care_assignment ca on ca.stay_id = s.id
      join public.org_membership om on om.org_id = s.org_id and om.profile_id = ca.profile_id
     where s.household_id = hh
       and s.ended_at is null
       and ca.profile_id = auth.uid()
       and ca.valid_from <= now()
       and (ca.valid_until is null or ca.valid_until > now())
       and om.active
  ) or exists (
    -- team lead van de afdeling van het open verblijf
    select 1
      from public.stay s
      join public.department_staff ds on ds.department_id = s.department_id
      join public.org_membership om on om.org_id = s.org_id and om.profile_id = ds.profile_id
     where s.household_id = hh
       and s.ended_at is null
       and ds.profile_id = auth.uid()
       and ds.role = 'team_lead'
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

create or replace function public.is_team_lead_van(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.department_staff ds
      join public.department d on d.id = ds.department_id
      join public.org_membership om on om.org_id = d.org_id and om.profile_id = ds.profile_id
     where d.org_id = org
       and ds.profile_id = auth.uid()
       and ds.role = 'team_lead'
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

create or replace function public.werkt_op_afdeling(dep uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.department_staff ds
      join public.department d on d.id = ds.department_id
      join public.org_membership om on om.org_id = d.org_id and om.profile_id = ds.profile_id
     where ds.department_id = dep
       and ds.profile_id = auth.uid()
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

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
