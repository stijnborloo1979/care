-- =====================================================================
--  THUIS — herstel van de embedding-trigger
--  Supabase migratie, versie 24
--
--  Draai dit na 09_ai.sql. Heb je 09 niet gedraaid, dan hoef je dit ook
--  niet te draaien.
--
--  De functie clear_embedding() kijkt in één voorwaarde naar de tabel én
--  naar een veld van die tabel:
--
--    if tg_table_name = 'memory_note' and (new.title is distinct from ...)
--
--  Postgres mag beide helften van een and uitrekenen, ook als de eerste
--  al onwaar is. Bij een update op item — dat geen kolom title heeft —
--  eindigt dat op:
--
--    record "new" has no field "title"  (SQLSTATE 42703)
--
--  Daardoor faalde elke update op item, en dus ook het bewaren van een
--  foto bij een ding. Hieronder staat elk veld in zijn eigen tak, zodat
--  een veld alleen wordt aangeraakt bij de tabel waar het bestaat.
-- =====================================================================

create or replace function public.clear_embedding()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'memory_note' then
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.embedding := null;
    end if;
  elsif tg_table_name = 'item' then
    if new.name is distinct from old.name or new.where_text is distinct from old.where_text then
      new.embedding := null;
    end if;
  end if;

  return new;
end;
$$;
