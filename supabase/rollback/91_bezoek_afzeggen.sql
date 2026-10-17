-- Terugdraaien van 91_bezoek_afzeggen.sql.
--
-- Herstelt laat_los naar de versie uit 44 (alleen de koppeling loslaten)
-- en zet de replica identity van agenda_event terug op de standaard.

alter table public.agenda_event replica identity default;

create or replace function public.laat_los(gebeurtenis uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh  uuid;
  wie uuid;
begin
  select household_id, claimed_by into hh, wie
    from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets loslaten';
  end if;
  if wie is distinct from auth.uid() then
    raise exception 'Dat heeft iemand anders opgenomen';
  end if;

  update public.agenda_event set claimed_by = null where id = gebeurtenis;
end;
$$;
