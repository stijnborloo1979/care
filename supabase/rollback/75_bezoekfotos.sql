-- Terugdraaien van 75_bezoekfotos.sql: de regels van 51 terug.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute $pol$drop policy if exists memories_write on storage.objects$pol$;
    execute $pol$create policy memories_write on storage.objects for insert
      with check (bucket_id = 'memories' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
    execute $pol$drop policy if exists memories_delete on storage.objects$pol$;
    execute $pol$create policy memories_delete on storage.objects for delete
      using (bucket_id = 'memories' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
  end if;
end $$;
drop function if exists public.mag_bezoekfoto_wissen(text);
drop function if exists public.mag_bezoekfoto_plaatsen(text);
drop function if exists public.bezoek_van_pad(text);
