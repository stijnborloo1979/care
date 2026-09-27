-- =====================================================================
--  THUIS — een gewijzigde instelling meteen op de tablet
--  Supabase migratie, versie 37
--
--  Draai dit wanneer het je uitkomt; het verandert geen gegevens.
--
--  Het probleem
--  ------------
--  Familie zet het thema van donker naar licht, of voegt een blok toe aan
--  het startscherm, en op de tablet gebeurt er niets. Zelfs verversen hielp
--  niet meteen.
--
--  Twee oorzaken die elkaar versterkten:
--
--    1. Beide instellingen staan op de rij van het huishouden zelf
--       (household.display_prefs en household.home_layout), en die tabel
--       stond niet in de realtime-publicatie. De tablet kreeg dus geen
--       enkel signaal dat er iets veranderd was.
--    2. De app beschouwt zo'n antwoord een minuut lang als vers, en haalt
--       het pas opnieuw op bij het terugkeren naar het scherm. Een tablet
--       in een standaard keert nooit terug — hij stáát daar — dus in de
--       praktijk gebeurde dat nooit.
--
--  Dit lost de eerste op. De tweede zit in de app.
--
--  Merk op: realtime respecteert row level security. Iemand ziet dus alleen
--  wijzigingen aan het huishouden waar hij bij hoort, precies zoals bij de
--  andere tabellen.
-- =====================================================================

do $$
begin
  alter publication supabase_realtime add table public.household;
exception when others then null;
end
$$;
