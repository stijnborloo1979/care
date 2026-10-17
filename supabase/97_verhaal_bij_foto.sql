-- =====================================================================
--  LIFEANGLE — de persoon vertelt over een foto (migratie 97)
--
--  Familie uploadt foto's (bestaand). De persoon ziet de foto's die nog
--  niets verteld zijn en vertelt er met de eigen stem over. Dat verhaal
--  is gewoon een life_story, maar krijgt een verwijzing naar de foto.
--
--  Vervangt 96: de persoon voegt geen foto's meer zelf toe. Heb je 96 al
--  gedraaid, dan ruimt deze migratie de drie policies van 96 op.
--
--  Draai dit na 95_tegels_kiezen.sql.
-- =====================================================================

drop policy if exists memory_photo_persoon_toevoegen on public.memory_photo;
drop policy if exists memory_photo_persoon_bijwerken on public.memory_photo;
drop policy if exists "home-memory_persoon_schrijven" on storage.objects;

alter table public.life_story
  add column if not exists foto_id uuid references public.memory_photo (id) on delete set null;

create index if not exists life_story_foto_idx on public.life_story (foto_id);
