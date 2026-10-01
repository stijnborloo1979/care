-- =====================================================================
--  LIFEANGLE — een eigen opslag voor verhalen en dagboek
--  Supabase migratie, versie 56
--
--  Draai dit na 55_leesaudit.sql.
--  Terugdraaien: supabase/rollback/56_dagboek_opslag.sql
--  Tests: supabase/tests/test_56_dagboek_opslag.sql
--
--  Waarom
--  ------
--  Opnames van verhalen en het dagboek staan vandaag in de bucket
--  'messages', in de map <huishouden>/verhalen/, tussen de spraakberichten.
--  Daar gelden de regels van berichten, met een uitzondering voor die map
--  (47). Dat is breekbaar: de nachtelijke opruiming van berichten wiste ze
--  bijvoorbeeld mee.
--
--  Vanaf nu
--  --------
--    - Nieuwe opnames gaan naar een eigen, privé bucket 'diary',
--      pad <huishouden>/<uuid>.<ext>. De app maakt eerst het verhaal en
--      uploadt daarna; zo hoort elke opname altijd bij een verhaal.
--    - life_story.audio_bucket zegt waar een opname staat
--      ('messages' voor alles van vroeger, 'diary' voor nieuw).
--    - Een opname in 'diary' beluisteren mag alleen wie het verhaal zelf
--      ziet (de bestaande regels van life_story beslissen) én vandaag een
--      opname mag beluisteren (files.messages.read: bewoner, tablet,
--      familie). Zo ziet niemand meer of minder dan vandaag.
--    - Wissen mag wie het verhaal mag wissen (verteller of beheerder).
--
--  Wat NIET verandert
--  ------------------
--  Bestaande opnames blijven waar ze staan, in 'messages'. Verhuizen kan
--  pas met een aparte stap (bestanden verplaatsen gaat niet vanuit SQL) en
--  na controle. De app leest beide.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Waar staat de opname
-- ---------------------------------------------------------------------

alter table public.life_story
  add column if not exists audio_bucket text not null default 'messages';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'life_story_audio_bucket_check') then
    alter table public.life_story add constraint life_story_audio_bucket_check
      check (audio_bucket in ('messages', 'diary'));
  end if;
  -- Een opname in 'diary' hoort altijd in de map van het eigen huishouden.
  -- Zo kan niemand een verhaal maken dat naar de opname van een ander
  -- huishouden wijst, om ze zo te kunnen beluisteren.
  if not exists (select 1 from pg_constraint where conname = 'life_story_diary_pad_check') then
    alter table public.life_story add constraint life_story_diary_pad_check
      check (audio_bucket <> 'diary' or audio_path like household_id::text || '/%');
  end if;
end
$$;

comment on column public.life_story.audio_bucket is
  'Waar de opname staat: messages (oud, map <hh>/verhalen/) of diary (vanaf 56, <hh>/<bestand>).';


-- ---------------------------------------------------------------------
--  2. De bucket
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'overgeslagen: storage.buckets bestaat niet';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('diary', 'diary', false, 26214400)
  on conflict (id) do nothing;
end
$$;


-- ---------------------------------------------------------------------
--  3. Hulpfunctie voor wissen
--
--  Wissen mag wie het verhaal mag wissen. De app maakt eerst het verhaal
--  en uploadt daarna de opname, en wist eerst de opname en daarna het
--  verhaal: er is dus altijd een verhaal dat zegt wie mag.
-- ---------------------------------------------------------------------

create or replace function public.mag_opname_wissen(pad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.life_story ls
     where ls.audio_bucket = 'diary' and ls.audio_path = pad
       and (ls.created_by = auth.uid() or public.can_legacy(ls.household_id, 'diary.delete_any')));
$$;

revoke execute on function public.mag_opname_wissen(text) from public, anon;
grant execute on function public.mag_opname_wissen(text) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  4. Storage-policies
-- ---------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (diary_*)';
    return;
  end if;

  -- Lezen: het verhaal is voor jou zichtbaar (RLS van life_story), en je
  -- mag vandaag opnames beluisteren.
  execute $pol$drop policy if exists diary_read on storage.objects$pol$;
  execute $pol$create policy diary_read on storage.objects for select
    using (
      bucket_id = 'diary'
      and exists (
        select 1 from public.life_story ls
         where ls.audio_bucket = 'diary'
           and ls.audio_path = name
           and ls.household_id::text = (storage.foldername(name))[1])
      and (public.is_self(((storage.foldername(name))[1])::uuid)
           or public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.read'))
    )$pol$;

  -- Schrijven: wie een verhaal mag toevoegen, rechtstreeks in de map van
  -- het huishouden (geen submappen), en alleen voor een verhaal dat al
  -- bestaat en dat je zelf vertelt.
  execute $pol$drop policy if exists diary_insert on storage.objects$pol$;
  execute $pol$create policy diary_insert on storage.objects for insert
    with check (
      bucket_id = 'diary'
      and array_length(storage.foldername(name), 1) = 1
      and public.can_legacy(((storage.foldername(name))[1])::uuid, 'diary.write')
      and exists (
        select 1 from public.life_story ls
         where ls.audio_bucket = 'diary' and ls.audio_path = name
           and ls.created_by = auth.uid())
    )$pol$;

  execute $pol$drop policy if exists diary_delete on storage.objects$pol$;
  execute $pol$create policy diary_delete on storage.objects for delete
    using (bucket_id = 'diary' and public.mag_opname_wissen(name))$pol$;
end
$$;

