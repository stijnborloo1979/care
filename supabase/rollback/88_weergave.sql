-- Terugdraaien van 88_weergave.sql.
--
-- Let op: set_display_prefs wordt hersteld naar de versie uit 07, zodat
-- indeling en palet daarna weer via die functie geschreven kunnen worden.
-- Bewaarde waarden in display_prefs blijven staan; de app leest ze dan
-- gewoon niet.

drop function if exists public.set_org_palet(uuid, text);
drop function if exists public.effective_weergave(uuid);
drop function if exists public.set_weergave(uuid, jsonb);

create or replace function public.set_display_prefs(hh uuid, prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.member_role;
  nieuw jsonb;
begin
  r := public.auth_role(hh);
  if r is null or r not in ('admin', 'member', 'person') then
    raise exception 'Geen recht om de instellingen te wijzigen';
  end if;

  update public.household
     set display_prefs = coalesce(display_prefs, '{}'::jsonb) || coalesce(prefs, '{}'::jsonb)
   where id = hh
   returning display_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_display_prefs(uuid, jsonb) to authenticated;

alter table public.organisation drop constraint if exists organisation_palet_check;
alter table public.organisation drop column if exists palet;
