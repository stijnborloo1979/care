-- =====================================================================
--  THUIS — een foto per kamer
--  Supabase migratie, versie 23
--
--  Draai dit na 01_schema.sql.
--
--  Dingen, mensen, medicatie, herinneringen en stappen konden al een foto
--  krijgen; kamers niet. Net bij kamers helpt een foto het meest: wie de
--  naam "berging" niet meer plaatst, herkent de deur wel.
-- =====================================================================

alter table public.room
  add column if not exists photo_path text;

comment on column public.room.photo_path is
  'Foto van de kamer in de bucket home-memory. Het pad begint met het huishouden-id.';
