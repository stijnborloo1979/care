-- Terugdraaien van 64_opruimen.sql: org_oversees, assign_caregiver en
-- unassign_caregiver zoals in 03; zorgteam weg.

drop function if exists public.zorgteam(uuid);

create or replace function public.org_oversees(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household h
    join public.org_membership om on om.org_id = h.org_id
    where h.id = hh
      and h.org_id is not null
      and om.profile_id = auth.uid()
      and om.active
      and om.role in ('org_admin', 'coordinator')
  );
$$;
grant execute on function public.org_oversees(uuid) to authenticated;

create or replace function public.assign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
begin
  select org_id into o from public.household where id = hh;
  if o is null then
    raise exception 'Dit huishouden hoort niet bij een organisatie';
  end if;

  -- Let op: org_role_of() geeft null voor wie niet bij de organisatie
  -- hoort, en "null not in (...)" is null, niet true. Zonder coalesce
  -- wordt de uitzondering overgeslagen en valt het hek open.
  if coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen een beheerder of coördinator kan toewijzen';
  end if;

  if not exists (
    select 1 from public.org_membership
    where org_id = o and profile_id = caregiver and active
  ) then
    raise exception 'Die persoon werkt niet voor deze organisatie';
  end if;

  insert into public.membership (household_id, profile_id, role, invited_by)
  values (hh, caregiver, 'caregiver', auth.uid())
  on conflict (household_id, profile_id) do nothing;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Zorgverlener toegewezen', auth.uid(), 'caregiver');
end;
$$;

create or replace function public.unassign_caregiver(hh uuid, caregiver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o uuid;
begin
  select org_id into o from public.household where id = hh;

  if public.family_role(hh) is distinct from 'admin'
     and (o is null or coalesce(public.org_role_of(o)::text, '') not in ('org_admin', 'coordinator')) then
    raise exception 'Geen recht om deze toewijzing te stoppen';
  end if;

  delete from public.membership
   where household_id = hh and profile_id = caregiver and role = 'caregiver';
end;
$$;

grant execute on function public.assign_caregiver(uuid, uuid) to authenticated;
grant execute on function public.unassign_caregiver(uuid, uuid) to authenticated;
