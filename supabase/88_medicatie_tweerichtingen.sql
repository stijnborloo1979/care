-- =====================================================================
--  THUIS — afvinken in de lijst bevestigt ook de medicatie
--  Supabase migratie, versie 88
--
--  Draai dit na 41_medicatie_gekoppeld.sql. Vervangt mark_done() uit
--  01_schema.sql; de rest van 01 blijft zoals het was.
--
--  Waarom
--  ------
--  41 zet een medicatie-item in de agenda af zodra de medicatie bevestigd
--  is. Het omgekeerde ontbrak: mark_done() raakte alleen agenda_event aan.
--  Gevolg: afvinken in de tijdlijn liet de medicatiekaart open staan, en
--  "ongedaan" zette de medicatie niet terug.
--
--  Wat er nu gebeurt
--  -----------------
--  - Item met med_moment, afvinken: alle medicatie van dat moment wordt
--    genomen (taken_at = nu, confirmed_by = wie afvinkte). Wat al genomen
--    was, blijft staan zoals het was.
--  - Item met med_moment, ongedaan: alle medicatie van dat moment gaat weer
--    open. Dat is de voorzichtige kant: "dit is niet gebeurd".
--  - Item zonder med_moment (met de hand gezet of uit een routine): dit
--    raakt de medicatie niet aan.
--
--  Bronregel: mark_done() schrijft zijn eigen regel in het zorglogboek
--  ("Medicatie nemen afgevinkt"). Dat blijft zo; er komt geen tweede regel
--  bij van de bevestiging zelf, want de trigger op medication_log schrijft
--  niets weg.
--
--  Let op: de tabel in de README en de regel "item met de hand afvinken
--  laat de medicatie ongemoeid" hoorden bij 41. Die regel klopt nu nog
--  steeds voor items zonder med_moment; voor items mét een moment is hij
--  achterhaald.
-- =====================================================================

create or replace function public.mark_done(event_id uuid, done boolean default true)
returns public.agenda_event
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.agenda_event;
  r public.member_role;
begin
  select * into e from public.agenda_event where id = event_id;
  if not found then
    raise exception 'Onbekend agenda-item';
  end if;

  r := public.auth_role(e.household_id);
  if r is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  -- Het medicatiemoment hoort bij het item: eerst de medicatie, dan het item.
  -- Bij afvinken worden alleen de nog openstaande doses genomen, zodat een
  -- eerder bevestigde dosis zijn oorspronkelijke tijdstip houdt.
  if e.kind = 'med' and e.med_moment is not null then
    if done then
      update public.medication_log
         set taken_at = now(),
             confirmed_by = auth.uid()
       where household_id = e.household_id
         and due_at = e.med_moment
         and taken_at is null;
    else
      update public.medication_log
         set taken_at = null,
             confirmed_by = null
       where household_id = e.household_id
         and due_at = e.med_moment
         and taken_at is not null;
    end if;
  end if;

  update public.agenda_event
     set done_at = case when done then now() else null end,
         done_by = case when done then auth.uid() else null end
   where id = event_id
   returning * into e;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (
    e.household_id,
    now(),
    e.title || case when done then ' afgevinkt' else ' opnieuw opengezet' end,
    auth.uid(),
    case when r = 'person' then 'person'
         when r = 'caregiver' then 'caregiver'
         else 'family' end
  );

  return e;
end;
$$;

comment on function public.mark_done(uuid, boolean) is
  'Afvinken of ongedaan maken van een agenda-item. Voor een medicatie-item (med_moment gevuld) worden de doses van dat moment mee genomen of teruggezet.';

grant execute on function public.mark_done(uuid, boolean) to authenticated;
