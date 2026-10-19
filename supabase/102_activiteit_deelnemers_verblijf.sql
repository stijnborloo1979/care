-- =====================================================================
--  LIFEANGLE CARE: deelnemers van een activiteit uit het verblijf (fase 2)
--
--  Draai na 101_zorg_taak.sql.
--
--  Voegt alle bewoners die nu op de afdeling van de activiteit verblijven
--  toe als deelnemer. Idempotent: wie er al in staat, blijft zoals hij is
--  (ook een eerder op "afwezig" gezette status verandert niet).
--  Alleen coördinator, beheerder of team lead, net als activiteiten beheren.
-- =====================================================================

create or replace function public.activiteit_deelnemers_uit_verblijf(activiteit uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  act public.activity;
  n integer;
begin
  select * into act from public.activity where id = activiteit;
  if act.id is null then
    raise exception 'Deze activiteit bestaat niet' using errcode = '22023';
  end if;
  -- coalesce: zonder lidmaatschap geeft beheert_activiteiten NULL, en not NULL slaat de controle over.
  if not coalesce(public.beheert_activiteiten(act.org_id), false) then
    raise exception 'Alleen coördinator, beheerder of team lead kan deelnemers toevoegen' using errcode = '42501';
  end if;
  if act.department_id is null then
    raise exception 'Deze activiteit hoort bij geen afdeling' using errcode = '22023';
  end if;

  insert into public.activity_participant (activity_id, household_id, status, created_by)
  select act.id, s.household_id, 'ingeschreven', auth.uid()
    from public.stay s
   where s.org_id = act.org_id
     and s.department_id = act.department_id
     and s.ended_at is null
  on conflict (activity_id, household_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.activiteit_deelnemers_uit_verblijf(uuid) from public, anon;
grant execute on function public.activiteit_deelnemers_uit_verblijf(uuid) to authenticated, service_role;
