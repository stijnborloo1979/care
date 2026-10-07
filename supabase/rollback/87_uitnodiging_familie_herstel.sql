-- Terugdraaien van 87_uitnodiging_familie_herstel.sql: create_invite zoals
-- in 05. Let op: op Supabase faalt "Iemand uitnodigen" dan weer.
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

  -- URL-veilig: dit token belandt in een link.
  t := replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-');
  t := replace(t, '=', '');

  insert into public.invitation (household_id, email, role, relation, token, invited_by)
  values (hh, lower(trim(invitee_email)), invitee_role, invitee_relation, t, auth.uid())
  returning * into inv;

  return query select inv.id, inv.token, inv.expires_at;
end;
$$;

drop function if exists public.uitnodiging_token();
