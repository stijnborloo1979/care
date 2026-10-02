-- =====================================================================
--  LIFEANGLE — hulpfuncties niet meer voor wie niet ingelogd is
--  Supabase migratie, versie 69
--
--  Draai dit na 68_bericht_zorgteam.sql.
--  Terugdraaien: supabase/rollback/69_anon_dicht.sql
--  Tests: supabase/tests/test_69_anon_dicht.sql
--
--  BESTAAND   Postgres geeft elke nieuwe functie uitvoerrecht aan iedereen
--             (PUBLIC). Bij negen hulpfuncties is dat nooit ingetrokken. Wie
--             niet ingelogd is maar het nummer van een huishouden kent, kon
--             zo het ondersteuningsniveau (support_level_of) en het gedeelde
--             huis (huis_van) opvragen. De andere zeven gaven alleen
--             false/0 terug, maar horen evenmin open te staan.
--  VOORGESTELD uitvoerrecht alleen voor ingelogde gebruikers (authenticated)
--             en de server (service_role). De inhoud van de functies blijft
--             gelijk.
--  REDEN      minimale dataopslag en -toegang; gevonden in de review.
--  RISICO     laag. De app roept deze functies alleen aan na het inloggen;
--             ze worden ook gebruikt in RLS-regels, en die gelden voor
--             tabellen waar anon toch al niets mag.
-- =====================================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.huis_van(uuid)', 'public.support_level_of(uuid)', 'public.deelt_huis(uuid)',
    'public.is_member(uuid)', 'public.is_org_staff(uuid)', 'public.is_self(uuid)',
    'public.mag_huis_bewerken(uuid)', 'public.medication_summary(uuid, date, date)',
    'public.shares_household(uuid)']
  loop
    if to_regprocedure(f) is null then
      raise notice 'overgeslagen: % bestaat niet', f;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;
