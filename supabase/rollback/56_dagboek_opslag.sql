-- Terugdraaien van 56_dagboek_opslag.sql.
--
-- LET OP: opnames die al in de bucket 'diary' staan, blijven daar staan,
-- maar zonder deze policies kan niemand ze nog beluisteren. Draai dit
-- alleen terug als er nog geen opnames in 'diary' staan:
--   select count(*) from public.life_story where audio_bucket = 'diary';
-- De bucket zelf en de kolom audio_bucket blijven bestaan.

do $$
begin
  if exists (select 1 from public.life_story where audio_bucket = 'diary') then
    raise exception 'Er staan al opnames in diary; terugdraaien zou ze onbereikbaar maken';
  end if;
end
$$;

drop policy if exists diary_read on storage.objects;
drop policy if exists diary_insert on storage.objects;
drop policy if exists diary_delete on storage.objects;
drop function if exists public.mag_opname_wissen(text);
alter table public.life_story drop constraint if exists life_story_diary_pad_check;
