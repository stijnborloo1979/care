-- =====================================================================
--  LIFEANGLE — de persoon voegt zelf een herinnering toe (migratie 96)
--
--  Een herinnering is een foto met een korte tekst, in memory_photo. Tot
--  nu toe konden alleen familie die toevoegen (memories.write). Deze
--  migratie geeft de persoon zelf het recht om een herinnering in het
--  eigen huishouden toe te voegen en te verbeteren: alleen rijen van
--  zijn eigen huishouden, en alleen foto's in de eigen map.
--
--  Wissen blijft bij familie.
--
--  Draai dit na 95_tegels_kiezen.sql.
-- =====================================================================

drop policy if exists memory_photo_persoon_toevoegen on public.memory_photo;
create policy memory_photo_persoon_toevoegen on public.memory_photo for insert
  with check (public.auth_role(household_id) = 'person');

drop policy if exists memory_photo_persoon_bijwerken on public.memory_photo;
create policy memory_photo_persoon_bijwerken on public.memory_photo for update
  using (public.auth_role(household_id) = 'person')
  with check (public.auth_role(household_id) = 'person');

drop policy if exists "home-memory_persoon_schrijven" on storage.objects;
create policy "home-memory_persoon_schrijven" on storage.objects for insert
  with check (
    bucket_id = 'home-memory'
    and public.auth_role(((storage.foldername(name))[1])::uuid) = 'person'
    and (storage.foldername(name))[2] = 'photos'
  );
