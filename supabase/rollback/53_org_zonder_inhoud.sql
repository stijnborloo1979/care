-- Terugdraaien van 53_org_zonder_inhoud.sql: org admin en coordinator
-- krijgen weer de rol 'member' bij elk gekoppeld huishouden (gedrag van 03).

create or replace function public.auth_role(hh uuid)
returns public.member_role
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.family_role(hh),
    case when public.org_oversees(hh) then 'member'::public.member_role else null end
  );
$$;

create or replace function public.is_member(hh uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.membership
    where household_id = hh and profile_id = auth.uid()
  ) or public.org_oversees(hh);
$$;

create or replace function public.legacy_relations(hh uuid)
returns setof text
language sql stable security definer set search_path = public
as $$
  select m.role::text
    from public.membership m
   where m.household_id = hh and m.profile_id = auth.uid()
  union all
  select 'org_member'
   where not exists (
           select 1 from public.membership m
            where m.household_id = hh and m.profile_id = auth.uid())
     and public.org_oversees(hh)
  union all
  select 'self'
   where public.is_self(hh);
$$;

drop trigger if exists care_assignment_controle on public.care_assignment;
drop function if exists public.toewijzing_controle();
drop function if exists public.org_bewoners(uuid);
drop function if exists public.toegewezen(uuid);
