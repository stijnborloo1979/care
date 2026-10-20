-- =====================================================================
--  LIFEANGLE Care — tijdens een uitstap geen maaltijd, tenzij de familie kiest
--  Supabase migratie, versie 106
--
--  Draai dit na 105_spraak_aan_zetten.sql (en na 80_uitstap.sql).
--  Terugdraaien: supabase/rollback/106_uitstap_maaltijd.sql
--  Tests: supabase/tests/test_106_uitstap_maaltijd.sql
--
--  BESTAAND   een bewoner op uitstap krijgt toch het eten van het huis
--             op de tablet, en het team moet het zelf wegstrepen.
--  VOORGESTELD uitstap.eet_mee, standaard uit: tijdens de uitstap vervalt
--             de maaltijd van het huis. De familie kan het aanzetten
--             ("blijft eten") tot het vertrek. Daarna ligt de keuze vast.
--  REDEN      geen eten dat niemand wil; de keuze blijft bij de familie.
--  RISICO     laag. Eén nieuwe kolom met standaardwaarde; bestaande
--             uitstappen krijgen "niet eten mee", dus de maaltijd vervalt
--             alleen voor uitstappen die nog komen of lopen.
--
--  Wie mag wat
--  -----------
--    eet_mee aanpassen   alleen de familie (agenda.write), via uitstap_eetkeuze().
--                        Het team en de org admin niet.
--    tot vertrek         daarna geweigerd: midden in de dag verandert niets meer.
-- =====================================================================

alter table public.uitstap add column if not exists eet_mee boolean not null default false;

comment on column public.uitstap.eet_mee is
  'Blijft de bewoner tijdens de uitstap eten? Standaard niet: dan vervalt de maaltijd van het huis. Alleen de familie past dit aan, tot het vertrek.';

create or replace function public.uitstap_eetkeuze(uitstap_id uuid, eet boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.uitstap;
begin
  select * into u from public.uitstap where id = uitstap_id for update;
  if not found
     or auth.uid() is null
     or not public.can_legacy(u.household_id, 'agenda.write') then
    raise exception 'Deze uitstap vind ik niet' using errcode = '42501';
  end if;
  if u.status <> 'gepland' or u.vertrek <= now() then
    raise exception 'Na het vertrek ligt de keuze vast' using errcode = '22023';
  end if;
  update public.uitstap set eet_mee = eet where id = u.id;
  return eet;
end;
$$;

revoke execute on function public.uitstap_eetkeuze(uuid, boolean) from public, anon;
grant execute on function public.uitstap_eetkeuze(uuid, boolean) to authenticated, service_role;
