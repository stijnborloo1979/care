-- =====================================================================
--  THUIS — AI-laag
--  Supabase migratie, versie 9
--
--  Zet eerst de extensie 'vector' aan: Dashboard -> Database ->
--  Extensions -> pgvector. Draai daarna dit bestand.
--
--  De regel uit de brief blijft overeind: nooit iets verzinnen. Deze laag
--  zoekt alleen in wat familie zelf heeft ingevuld, en geeft niets terug
--  onder de drempel. De app moet volledig werken zonder dit bestand.
-- =====================================================================

create extension if not exists vector with schema extensions;

alter table public.memory_note add column if not exists embedding extensions.vector(1536);
alter table public.item        add column if not exists embedding extensions.vector(1536);

-- Verandert de tekst, dan is de oude embedding niet meer geldig.
create or replace function public.clear_embedding()
returns trigger
language plpgsql
as $$
begin
  -- Elk veld in zijn eigen tak. Zet je de tabelnaam en het veld in één
  -- and, dan rekent Postgres beide helften uit en klapt een update op
  -- item eruit met "record new has no field title".
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

drop trigger if exists memory_note_embedding_reset on public.memory_note;
create trigger memory_note_embedding_reset
  before update on public.memory_note
  for each row execute function public.clear_embedding();

drop trigger if exists item_embedding_reset on public.item;
create trigger item_embedding_reset
  before update on public.item
  for each row execute function public.clear_embedding();

create index if not exists memory_note_embedding_idx
  on public.memory_note using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create index if not exists item_embedding_idx
  on public.item using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- Wat moet er nog verwerkt worden? De edge function haalt dit op.
create or replace function public.pending_embeddings(limiet integer default 25)
returns table (soort text, id uuid, household_id uuid, tekst text)
language sql
stable
security definer
set search_path = public
as $$
  (select 'memory_note', n.id, n.household_id, n.title || '. ' || n.body
     from public.memory_note n where n.embedding is null limit limiet)
  union all
  (select 'item', i.id, i.household_id,
          i.name || '. ' || coalesce(i.where_text, '')
     from public.item i where i.embedding is null limit limiet);
$$;

create or replace function public.set_embedding(
  soort text, rij_id uuid, vec extensions.vector(1536))
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if soort = 'memory_note' then
    update public.memory_note set embedding = vec where id = rij_id;
  elsif soort = 'item' then
    update public.item set embedding = vec where id = rij_id;
  else
    raise exception 'Onbekend soort: %', soort;
  end if;
end;
$$;

/*
 * Zoekt in de eigen gegevens van één huishouden. De drempel is een
 * productbeslissing, geen technische: liever te vaak niets vinden dan
 * één keer iets verkeerds antwoorden.
 */
create or replace function public.match_memory(
  hh uuid,
  query_embedding extensions.vector(1536),
  drempel double precision default 0.78,
  aantal integer default 4)
returns table (soort text, id uuid, titel text, tekst text, gelijkenis double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select * from (
    select 'weetje'::text, n.id, n.title, n.body,
           1 - (n.embedding <=> query_embedding)
    from public.memory_note n
    where n.household_id = hh and n.embedding is not null and public.is_member(hh)
    union all
    select 'ding'::text, i.id, i.name, coalesce(i.where_text, ''),
           1 - (i.embedding <=> query_embedding)
    from public.item i
    where i.household_id = hh and i.embedding is not null and public.is_member(hh)
  ) t(soort, id, titel, tekst, gelijkenis)
  where t.gelijkenis >= drempel
  order by t.gelijkenis desc
  limit aantal;
$$;

grant execute on function public.match_memory(uuid, extensions.vector, double precision, integer) to authenticated;
