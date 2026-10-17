-- Terugdraaien van 96_herinnering_persoon.sql.
-- De persoon kan dan geen herinneringen meer toevoegen; familie blijft dat wel.

drop policy if exists memory_photo_persoon_toevoegen on public.memory_photo;
drop policy if exists memory_photo_persoon_bijwerken on public.memory_photo;
drop policy if exists "home-memory_persoon_schrijven" on storage.objects;
