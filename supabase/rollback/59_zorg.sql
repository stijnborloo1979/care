-- Terugdraaien van 59_zorg.sql. LET OP: de zorgnotities, overdrachten en
-- activiteiten gaan weg, met hun inhoud. Draai dit alleen als er nog niets
-- in staat:
--   select (select count(*) from care_note), (select count(*) from handover), (select count(*) from activity);

do $$
begin
  if exists (select 1 from public.care_note) or exists (select 1 from public.handover)
     or exists (select 1 from public.activity) then
    raise exception 'Er staan al zorgnotities, overdrachten of activiteiten; terugdraaien zou ze wissen';
  end if;
end
$$;

-- nood_inzage zoals in 54
create or replace function public.nood_inzage(a_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a   public.emergency_access;
  hh  uuid;
  tz  text;
begin
  a := public.actieve_noodtoegang(a_id);
  if a.id is null then
    raise exception 'Deze noodtoegang is niet (meer) actief' using errcode = '42501';
  end if;
  hh := a.household_id;

  insert into public.emergency_access_log (access_id, household_id, actor_id, action)
  values (a.id, hh, auth.uid(), 'inzage');

  select coalesce(timezone, 'Europe/Brussels') into tz from public.household where id = hh;

  return jsonb_build_object(
    'noodtoegang', jsonb_build_object('id', a.id, 'tot', a.expires_at),
    'bewoner', (select jsonb_build_object('naam', h.person_name, 'tijdzone', h.timezone)
                  from public.household h where h.id = hh),
    'voorkeuren', coalesce((
      select jsonb_agg(jsonb_build_object('titel', m.title, 'tekst', m.body) order by m.title)
        from public.memory_note m
       where m.household_id = hh and m.category = 'voorkeuren'), '[]'::jsonb),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('om', e.starts_at, 'titel', e.title, 'soort', e.kind,
                                          'gedaan', e.done_at is not null) order by e.starts_at)
        from public.agenda_event e
       where e.household_id = hh
         and e.starts_at >= (date_trunc('day', now() at time zone tz) at time zone tz)
         and e.starts_at <  (date_trunc('day', now() at time zone tz) at time zone tz) + interval '2 days'), '[]'::jsonb),
    'logboek', coalesce((
      select jsonb_agg(jsonb_build_object('om', c.occurred_at, 'titel', c.title, 'notitie', c.note)
                       order by c.occurred_at desc)
        from public.care_log c
       where c.household_id = hh and c.occurred_at > now() - interval '24 hours'), '[]'::jsonb),
    'contacten', coalesce((
      select jsonb_agg(jsonb_build_object('naam', p.name, 'relatie', p.relation, 'telefoon', p.phone)
                       order by p.sort, p.name)
        from public.person_card p
       where p.household_id = hh and p.kind in ('family', 'contact', 'care')), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.nood_inzage(uuid) from public, anon;
grant execute on function public.nood_inzage(uuid) to authenticated;

drop trigger if exists stay_care_note_bewaren on public.stay;
drop function if exists public.care_note_bewaartermijn();
drop function if exists public.care_note_opruimen();
drop table if exists public.activity_participant;
drop table if exists public.activity;
drop function if exists public.ziet_activiteiten_van(uuid);
drop function if exists public.beheert_activiteiten(uuid);
drop function if exists public.woont_in(uuid, uuid);
drop table if exists public.handover;
drop function if exists public.werkt_op_afdeling(uuid);
drop table if exists public.care_note;
drop function if exists public.care_note_vul();
drop function if exists public.huidige_org(uuid);
