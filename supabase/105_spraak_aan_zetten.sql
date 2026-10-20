-- =====================================================================
--  LIFEANGLE CARE: persoonlijke spraak-schakelaar (fase 3, stap 2)
--
--  Een medewerker mag zelf zijn eigen spraakvragen aan- of uitzetten.
--  org_membership_admin laat alleen org_admin bijwerken, dus dit gaat
--  via een security definer functie die alleen het eigen veld wijzigt.
--  Draai dit in de SQL-editor, na 104. Standaard verandert er niets.
-- =====================================================================

create or replace function public.spraak_aan_zetten(org uuid, aan boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  update public.org_membership m
     set spraak_aan = aan
   where m.org_id = org
     and m.profile_id = auth.uid()
     and m.active
  returning true into v_ok;

  -- Geen actief lidmaatschap: niets gewijzigd.
  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.spraak_aan_zetten(uuid, boolean) from public, anon;
grant execute on function public.spraak_aan_zetten(uuid, boolean) to authenticated, service_role;

comment on function public.spraak_aan_zetten(uuid, boolean) is
  'Zet de eigen spraakvragen aan of uit voor één organisatie. Raakt alleen org_membership.spraak_aan van de aanroeper.';
