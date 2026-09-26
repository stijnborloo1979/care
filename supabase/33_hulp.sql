-- =====================================================================
--  THUIS — "ik heb hulp nodig"
--  Supabase migratie, versie 33
--
--  Draai dit na 06_nightly_job.sql en 30_terugbellen.sql.
--
--  Op het Help-scherm stond een knop "Noodnummer 112". Op een tablet
--  zonder simkaart doet die niets: het toestel opent hooguit zijn eigen
--  belscherm en daar blijft het bij. Dat is de gevaarlijkste knop die je
--  kan maken — iemand drukt erop in een echte noodsituatie en wacht op
--  hulp die niet komt.
--
--  Een knop die niet kan bellen, hoort niet te doen alsof. Wat een toestel
--  zonder telefoon wél kan, is familie bereiken. Dat is geen 112 en mag er
--  ook nooit voor doorgaan, maar het is wat er is.
--
--  Anders dan vraag_gesprek(): geen tien minuten wachttijd maar twee, en
--  niveau 'alert'. Wie in nood twee keer drukt, hoort niet genegeerd te
--  worden; tegelijk mag één vastgehouden vinger geen dertig meldingen
--  maken.
-- =====================================================================

create or replace function public.vraag_hulp(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  if exists (
    select 1 from public.notification
     where household_id = hh
       and dedupe_key = 'hulp'
       and created_at > now() - interval '2 minutes'
  ) then
    return;
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = 'hulp';

  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'alert', naam || ' heeft op Hulp gedrukt en vraagt of je komt.', null, 'hulp');
end;
$$;

grant execute on function public.vraag_hulp(uuid) to authenticated;

comment on function public.vraag_hulp(uuid) is
  'De persoon vraagt dringend hulp aan familie. Geen vervanging van een noodnummer. Hoogstens één melding per twee minuten.';
