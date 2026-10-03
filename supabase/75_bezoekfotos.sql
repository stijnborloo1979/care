-- =====================================================================
--  LIFEANGLE — de foto van een bezoek blijft bij dat bezoek
--  Supabase migratie, versie 75
--
--  Draai dit na 74_bezoekboek.sql.
--  Terugdraaien: supabase/rollback/75_bezoekfotos.sql
--  Tests: supabase/tests/test_75_bezoekfotos.sql
--
--  BESTAAND   foto's van bezoeken staan in de bucket memories (74). Daar
--             mag elk familielid met files.memories.write elk bestand
--             plaatsen en wissen (51). Zo kon iemand de bezoekfoto van een
--             ander wissen, of een bestand in de map van een bezoek zetten
--             dat niet van hem is.
--  VOORGESTELD in de map <huishouden>/bezoek/ geldt meer:
--               plaatsen  alleen bij een eigen bezoek van de laatste 24 uur
--                         (het pad begint met de id van dat bezoek, 74)
--               wissen    als het jouw bezoek is of je familiebeheerder bent;
--                         een foto zonder bezoek: wie ze plaatste, of na
--                         een uur iedereen die foto's mag beheren
--             Buiten die map verandert er niets.
--  RISICO     laag: alleen de map bezoek, die nieuw is in 74.
-- =====================================================================

do $$
begin
  if to_regclass('public.visit_log') is null then
    raise exception 'Draai eerst 74_bezoekboek.sql';
  end if;
end
$$;

-- Wie 74 al draaide vóór de strengere regel: die regel hier opnieuw zetten.
-- Een foto hoort bij zijn eigen bezoek: <hh>/bezoek/<id van dat bezoek>-…
alter table public.visit_log drop constraint if exists visit_log_foto_pad;
alter table public.visit_log add constraint visit_log_foto_pad
  check (photo_path is null or photo_path like household_id::text || '/bezoek/' || id::text || '-%');

-- Het bezoek waar een pad bij hoort: <hh>/bezoek/<36 tekens id>-…
create or replace function public.bezoek_van_pad(pad text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(pad, '/', 2) = 'bezoek'
     and substr(split_part(pad, '/', 3), 1, 36) ~ '^[0-9a-f-]{36}$'
    then substr(split_part(pad, '/', 3), 1, 36)::uuid
  end;
$$;

create or replace function public.mag_bezoekfoto_plaatsen(pad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.visit_log v
     where v.id = public.bezoek_van_pad(pad)
       and v.household_id::text = split_part(pad, '/', 1)
       and v.author_id = auth.uid()
       and v.created_at > now() - interval '24 hours');
$$;

-- Wissen mag als het jouw bezoek is of je familiebeheerder bent. Een foto
-- waar (nog) geen bezoek naar wijst: alleen door wie ze plaatste, of als ze
-- ouder is dan een uur. Zo kan niemand een foto wissen in de seconde
-- tussen het uploaden en het koppelen aan het bezoek.
create or replace function public.mag_bezoekfoto_wissen(pad text, eigenaar uuid, gemaakt timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.visit_log v where v.photo_path = pad) then
      exists (select 1 from public.visit_log v
               where v.photo_path = pad
                 and (v.author_id = auth.uid() or public.family_role(v.household_id) = 'admin'))
    else
      eigenaar = auth.uid() or coalesce(gemaakt, now()) < now() - interval '1 hour'
        or public.family_role(split_part(pad, '/', 1)::uuid) = 'admin'
  end;
$$;

revoke execute on function public.mag_bezoekfoto_plaatsen(text) from public, anon;
revoke execute on function public.mag_bezoekfoto_wissen(text, uuid, timestamptz) from public, anon;
grant execute on function public.bezoek_van_pad(text) to authenticated, service_role;
grant execute on function public.mag_bezoekfoto_plaatsen(text) to authenticated;
grant execute on function public.mag_bezoekfoto_wissen(text, uuid, timestamptz) to authenticated;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet';
  else
    execute $pol$drop policy if exists memories_write on storage.objects$pol$;
    execute $pol$create policy memories_write on storage.objects for insert
      with check (bucket_id = 'memories'
        and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write')
        and ((storage.foldername(name))[2] is distinct from 'bezoek' or public.mag_bezoekfoto_plaatsen(name)))$pol$;
    execute $pol$drop policy if exists memories_delete on storage.objects$pol$;
    execute $pol$create policy memories_delete on storage.objects for delete
      using (bucket_id = 'memories'
        and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write')
        and ((storage.foldername(name))[2] is distinct from 'bezoek' or public.mag_bezoekfoto_wissen(name, owner, created_at)))$pol$;
  end if;
end $$;
