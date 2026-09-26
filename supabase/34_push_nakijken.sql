-- =====================================================================
--  THUIS — waarom komt die melding niet aan?
--  Supabase migratie, versie 34
--
--  Draai dit na 20_push.sql.
--
--  Een pushbericht kan op drie plaatsen stilvallen, en alle drie doen ze
--  dat zonder een spoor:
--
--    1. Dit toestel heeft geen toestemming gegeven. Toestemming is per
--       toestel én per account: aanzetten op de tablet doet niets voor de
--       telefoon van de dochter.
--    2. Het huishouden staat niet op "ondersteund". pending_pushes() stuurt
--       alleen in die fase — een bewuste keuze, maar wie hem niet kent,
--       zoekt zich blind.
--    3. De edge function push-notify draait niet. Die hangt aan pg_cron, en
--       pg_cron moet je apart inschakelen.
--
--  Dit maakt die drie zichtbaar, zodat het scherm kan zeggen wat eraan
--  scheelt in plaats van niets te doen.
-- =====================================================================

create or replace function public.push_status(hh uuid)
returns table (
  toestellen     integer,
  eigen_toestel  boolean,
  niveau_ok      boolean,
  wachtend       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int
       from public.push_subscription s
       join public.membership m on m.profile_id = s.profile_id
                               and m.household_id = s.household_id
      where s.household_id = hh and m.role in ('admin', 'member')),
    exists (select 1 from public.push_subscription s
             where s.household_id = hh and s.profile_id = auth.uid()),
    (select support_level = 'ondersteund' from public.household where id = hh),
    (select count(*)::int from public.notification n
      where n.household_id = hh
        and n.pushed_at is null
        and n.created_at > now() - interval '2 hours')
  where public.auth_role(hh) in ('admin', 'member');
$$;

grant execute on function public.push_status(uuid) to authenticated;

comment on function public.push_status(uuid) is
  'Waarom komt een melding niet aan: hoeveel toestellen staan aan, staat dit toestel erbij, laat het ondersteuningsniveau push toe, en hoeveel meldingen wachten er.';


-- ---------------------------------------------------------------------
--  Een testmelding
--
--  Eén rij, zoals elke andere melding, zodat ze precies dezelfde weg
--  aflegt. Een test die een andere weg neemt, bewijst niets.
-- ---------------------------------------------------------------------

create or replace function public.test_push(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een testmelding sturen';
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = 'test';

  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'info', 'Test: als je dit op je telefoon ziet, werken de meldingen.', null, 'test');
end;
$$;

grant execute on function public.test_push(uuid) to authenticated;
