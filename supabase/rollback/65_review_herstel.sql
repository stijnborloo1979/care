-- Terugdraaien van 65_review_herstel.sql. LET OP: dit zet de lekken uit de
-- review terug open. Alleen gebruiken als 65 zelf iets breekt.

drop trigger if exists department_staff_controle on public.department_staff;
drop function if exists public.afdeling_controle();
drop trigger if exists org_membership_eigen_rol on public.org_membership;
drop function if exists public.eigen_rol_controle();

-- mag_toewijzen en koppel_met_wzc zoals in 60
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
               where ds.department_id = s.department_id and ds.profile_id = auth.uid()
                 and ds.role = 'team_lead' and ds.valid_from <= now()
                 and (ds.valid_until is null or ds.valid_until > now()))));
$$;

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
  select * into o from public.organisation
   where koppelcode = upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g')) and active;
  if o.id is null then
    raise exception 'Deze code kennen we niet. Kijk ze na of vraag ze opnieuw aan het woonzorgcentrum.' using errcode = '22023';
  end if;
  perform public.link_household_to_org(hh, o.id);
  return o.name;
end;
$$;

revoke execute on function public.koppel_met_wzc(uuid, text) from public, anon;
grant execute on function public.koppel_met_wzc(uuid, text) to authenticated, service_role;

drop table if exists public.koppel_poging;

grant select, update on public.organisation to authenticated;
