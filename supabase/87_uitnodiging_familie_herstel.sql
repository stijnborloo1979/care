-- =====================================================================
--  LIFEANGLE — familie uitnodigen werkt weer op Supabase
--  Supabase migratie, versie 87
--
--  Draai dit na 86_prijzen_livegang.sql. Draai daarna
--  76_systeemcontrole.sql opnieuw.
--  Terugdraaien: supabase/rollback/87_uitnodiging_familie_herstel.sql
--  Tests: supabase/tests/test_87_uitnodiging_familie.sql
--
--  BESTAAND   create_invite (05) maakt het token met gen_random_bytes(),
--             zonder schemanaam, in een functie met search_path = public.
--             Op Supabase staat pgcrypto in het schema "extensions". De
--             functie vindt gen_random_bytes dan niet, en "Iemand
--             uitnodigen" bij Familie geeft "Uitnodigen lukte niet".
--             60 en 84 schreven al extensions.gen_random_bytes; 05 werd
--             nooit aangepast, en er was geen test voor.
--  VOORGESTELD uitnodiging_token(): één plek die een URL-veilig token
--             maakt, met extensions.gen_random_bytes. create_invite
--             gebruikt die. Verder blijft create_invite precies gelijk:
--             zelfde parameters, zelfde controles, zelfde uitvoer.
--  RISICO     geen: een functie die faalde, werkt. Bestaande uitnodigingen
--             blijven geldig.
-- =====================================================================

create or replace function public.uitnodiging_token()
returns text
language sql
volatile
set search_path = public
as $$
  -- URL-veilig: dit token belandt in een link.
  select replace(replace(replace(
    encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
$$;

revoke execute on function public.uitnodiging_token() from public, anon, authenticated;

create or replace function public.create_invite(
  hh uuid,
  invitee_email text,
  invitee_role public.member_role default 'member',
  invitee_relation text default null)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  inv public.invitation;
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan iemand uitnodigen';
  end if;

  if invitee_email is null or position('@' in invitee_email) = 0 then
    raise exception 'Geen geldig e-mailadres';
  end if;

  t := public.uitnodiging_token();

  insert into public.invitation (household_id, email, role, relation, token, invited_by)
  values (hh, lower(trim(invitee_email)), invitee_role, invitee_relation, t, auth.uid())
  returning * into inv;

  return query select inv.id, inv.token, inv.expires_at;
end;
$$;
