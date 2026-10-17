-- Terugdraaien van 97_verhaal_bij_foto.sql.
-- De policies van 96 worden niet teruggezet: die waren bewust weg.

drop index if exists public.life_story_foto_idx;
alter table public.life_story drop column if exists foto_id;
