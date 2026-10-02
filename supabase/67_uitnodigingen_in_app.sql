-- =====================================================================
--  LIFEANGLE Care — uitnodigingen ook in de app, niet alleen via de link
--  Supabase migratie, versie 67
--
--  Draai dit na 66_null_rolcontrole.sql.
--  Terugdraaien: supabase/rollback/67_uitnodigingen_in_app.sql
--  Tests: supabase/tests/test_67_uitnodigingen_in_app.sql
--
--  BESTAAND   een medewerker kon een uitnodiging alleen aanvaarden via de
--             link in de mail (token).
--  VOORGESTELD wie inlogt met het uitgenodigde e-mailadres, ziet de open
--             uitnodiging ook in de app en aanvaardt ze daar.
--  REDEN      een mail raakt kwijt of komt in spam; de toegang moet via de
--             app zelf kunnen.
--  RISICO     laag: zelfde controle als de link (e-mailadres moet kloppen),
--             het token wordt nooit getoond. Nieuw, raakt niets bestaands.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.aanvaard_org_uitnodiging(text)') is null then
    raise exception 'Draai eerst 60_personeel.sql';
  end if;
end
$$;

create or replace function public.mijn_org_uitnodigingen()
returns table (id uuid, organisatie text, rol text, verloopt timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, o.name, i.role::text, i.expires_at
    from public.org_invitation i
    join public.organisation o on o.id = i.org_id and o.active
   where auth.uid() is not null
     and lower(i.email) = (select lower(u.email) from auth.users u where u.id = auth.uid())
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   order by i.created_at desc;
$$;

create or replace function public.aanvaard_org_uitnodiging_id(uitnodiging uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t text;
begin
  select token into t from public.org_invitation where id = uitnodiging;
  if t is null then
    raise exception 'Deze uitnodiging bestaat niet' using errcode = '22023';
  end if;
  -- Alle controles (ingetrokken, verlopen, juiste e-mailadres) gebeuren daar.
  return public.aanvaard_org_uitnodiging(t);
end;
$$;

revoke execute on function public.mijn_org_uitnodigingen() from public, anon;
revoke execute on function public.aanvaard_org_uitnodiging_id(uuid) from public, anon;
grant execute on function public.mijn_org_uitnodigingen() to authenticated;
grant execute on function public.aanvaard_org_uitnodiging_id(uuid) to authenticated;
