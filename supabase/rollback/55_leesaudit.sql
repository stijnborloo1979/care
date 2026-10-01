-- Terugdraaien van 55_leesaudit.sql. De logregels zelf blijven staan; de
-- kolommen org_id en detail ook (ze storen niets en houden de geschiedenis).

drop trigger if exists audit_org_membership on public.org_membership;
drop trigger if exists audit_department_staff on public.department_staff;
drop trigger if exists audit_care_assignment on public.care_assignment;
drop trigger if exists audit_stay on public.stay;
drop function if exists public.audit_wijziging();

-- last_location zoals in 08
drop function if exists public.last_location(uuid);
create function public.last_location(hh uuid)
returns table (at timestamptz, lat double precision, lng double precision, inside_zone boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select lp.at, lp.lat, lp.lng, lp.inside_zone
  from public.location_point lp
  where lp.household_id = hh
  order by lp.at desc
  limit 1;
$$;
grant execute on function public.last_location(uuid) to authenticated;

drop function if exists public.open_verhaal_opname(uuid);
drop function if exists public.open_document(uuid);
drop function if exists public.audit_inzage(uuid, text, uuid);
drop policy if exists audit_read_org on public.audit_log;
