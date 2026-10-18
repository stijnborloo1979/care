-- =====================================================================
--  LIFEANGLE — hotfix: een WZC aanmaken is niet meer vrij
--  Supabase migratie, versie 99
--
--  Draai dit na 97_verhaal_bij_foto.sql.
--  Terugdraaien: supabase/rollback/99_create_organisation_dicht.sql
--  Tests: supabase/tests/test_99_create_organisation_dicht.sql
--
--  BESTAAND   iedere ingelogde gebruiker kon create_organisation() aanroepen,
--             werd beheerder van een nieuw, actief WZC, en kon een koppelcode
--             uitdelen. Daarmee konden families aan een nep-WZC gekoppeld
--             worden en de bewoners zien.
--  VOORGESTELD het recht om create_organisation() uit te voeren wordt
--             ingetrokken voor gebruikers. Het aanvraagproces (migratie 98)
--             vervangt die route; dit is de minimale afsluiting tot dan.
--  RISICO     laag. /zorg/nieuw geeft een fout tot de nieuwe frontend live is.
-- =====================================================================

revoke execute on function public.create_organisation(text, text) from public, anon, authenticated;
