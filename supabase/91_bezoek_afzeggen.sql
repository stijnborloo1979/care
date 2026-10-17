-- =====================================================================
--  LIFEANGLE — bezoek afzeggen (migratie 91)
--
--  "Toch niet" bij een bezoek dat je zelf hebt aangekondigd, haalt het
--  bezoek nu helemaal weg uit de agenda. Voorheen werd alleen de koppeling
--  losgelaten, en bleef het bezoek op alle schermen staan.
--
--  Andere gebeurtenissen (afspraken, routines) blijven zoals ze waren:
--  daar laat "Toch niet" alleen de koppeling los.
--
--  Daarnaast krijgt agenda_event REPLICA IDENTITY FULL. Zonder dat stuurt
--  realtime bij een verwijdering geen household_id mee, en komt de
--  verwijdering dus niet door op de andere schermen.
--
--  Draai dit na 90_knop_fotos.sql.
-- =====================================================================

-- 1. Verwijderingen moeten bij alle schermen van het huishouden aankomen.
alter table public.agenda_event replica identity full;

-- 2. laat_los: bezoek weg, rest loslaten.
create or replace function public.laat_los(gebeurtenis uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh   uuid;
  wie  uuid;
  soort text;
begin
  select household_id, claimed_by, kind into hh, wie, soort
    from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets loslaten';
  end if;
  -- Alleen je eigen toezegging terugnemen. Wie iets van een ander afneemt,
  -- laat die ander in de veronderstelling dat het geregeld is.
  if wie is distinct from auth.uid() then
    raise exception 'Dat heeft iemand anders opgenomen';
  end if;

  if soort = 'visit' then
    -- Een bezoek dat je zelf zegt af te zeggen, komt er dan niet meer.
    delete from public.agenda_event where id = gebeurtenis;
  else
    update public.agenda_event set claimed_by = null where id = gebeurtenis;
  end if;
end;
$$;

grant execute on function public.laat_los(uuid) to authenticated;
