-- =====================================================================
--  THUIS — medicatie beheren
--  Supabase migratie, versie 18
--
--  Draai dit na 01_schema.sql en 06_nightly_job.sql.
--
--  Tot nu toe kon medicatie alleen via SQL worden toegevoegd, met één uur
--  per rij. Dat klopt niet met de werkelijkheid: "twee keer per dag" is
--  één medicijn, geen twee.
--
--  - at_times: alle tijdstippen van een medicijn. at_time blijft bestaan
--    voor oudere code en bevat het eerste tijdstip.
--  - sync_medication_today(): past de momenten van vandaag en morgen
--    meteen aan na een wijziging, in plaats van te wachten op de nacht.
--    Alleen momenten in de toekomst: een nieuw medicijn om 8 uur 's
--    ochtends toegevoegd om 15 uur, geeft vandaag geen "vergeten" melding.
-- =====================================================================

alter table public.medication add column if not exists at_times time[];

update public.medication set at_times = array[at_time] where at_times is null;

comment on column public.medication.at_times is
  'Alle tijdstippen van dit medicijn. at_time bevat het eerste, voor oudere code.';

-- De nachtelijke job kent nu ook meerdere tijdstippen.
create or replace function public.ensure_medication_log(hh uuid, on_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz       text;
  n        integer := 0;
  med      record;
  tijdstip time;
begin
  select timezone into tz from public.household where id = hh;
  if tz is null then
    raise exception 'Onbekend huishouden';
  end if;

  for med in select * from public.medication where household_id = hh and active loop
    foreach tijdstip in array coalesce(med.at_times, array[med.at_time]) loop
      insert into public.medication_log (medication_id, household_id, due_at)
      values (med.id, hh, ((on_day + tijdstip) at time zone tz))
      on conflict (medication_id, due_at) do nothing;
      n := n + 1;
    end loop;
  end loop;

  return n;
end;
$$;

create or replace function public.sync_medication_today(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tz         text;
  vandaag    date;
  med        record;
  tijdstip   time;
  dag_extra  integer;
  moment     timestamptz;
begin
  if public.auth_role(hh) is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan het medicatieschema wijzigen';
  end if;

  select timezone into tz from public.household where id = hh;
  vandaag := (now() at time zone tz)::date;

  -- Toekomstige momenten die niet meer kloppen, gaan weg: een gestopt
  -- medicijn of een verschoven uur. Wat al genomen is, blijft staan.
  delete from public.medication_log ml
   where ml.household_id = hh
     and ml.taken_at is null
     and ml.due_at > now()
     and not exists (
       select 1
       from public.medication m,
            unnest(coalesce(m.at_times, array[m.at_time])) as u(tijd)
       where m.id = ml.medication_id
         and m.active
         and ((((ml.due_at at time zone tz)::date) + u.tijd) at time zone tz) = ml.due_at
     );

  -- Nieuwe momenten, voor vandaag en morgen, alleen in de toekomst.
  for med in select * from public.medication where household_id = hh and active loop
    foreach tijdstip in array coalesce(med.at_times, array[med.at_time]) loop
      for dag_extra in 0..1 loop
        moment := ((vandaag + dag_extra) + tijdstip) at time zone tz;
        if moment > now() then
          insert into public.medication_log (medication_id, household_id, due_at)
          values (med.id, hh, moment)
          on conflict (medication_id, due_at) do nothing;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

grant execute on function public.sync_medication_today(uuid) to authenticated;
