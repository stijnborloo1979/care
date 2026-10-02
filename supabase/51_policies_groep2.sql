-- =====================================================================
--  LIFEANGLE — policies via can_legacy(), groep 2
--  Supabase migratie, versie 51
--
--  Draai dit na 50_policies_groep1.sql.
--  Terugdraaien: supabase/rollback/51_policies_groep2.sql
--  Tests: supabase/tests/test_51_policy_parity.sql
--
--  De gevoelige tabellen en de bestanden: medicatie, logboek, locatie,
--  Onthoud dit, verhalen en dagboek, berichten, documenten, auditlog, en
--  de storage-policies van avatars, memories, documents en messages.
--  Home Memory (room, item, item_step, bucket home-memory) blijft op
--  deelt_huis() / mag_huis_bewerken(): dat gaat over een woning, niet over
--  een persoon, en krijgt later een eigen relatie.
--
--  Wie wat mag, verandert NIET (zie de policytest).
--
--  Een tabel die in jouw project niet bestaat (omdat een optionele
--  migratie niet gedraaid is), wordt overgeslagen met een melding.
-- =====================================================================

do $$
begin
  if not exists (select 1 from public.permission where key = 'files.messages.delete') then
    raise exception 'Draai eerst 50_policies_groep1.sql';
  end if;
end
$$;

do $$ begin
  if to_regclass('public.medication') is null then
    raise notice 'overgeslagen: public.medication bestaat niet (medication_read)';
  else
    execute $pol$drop policy if exists medication_read on public.medication$pol$;
    execute $pol$create policy medication_read on public.medication for select
      using (public.can_legacy(household_id, 'medication.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.medication') is null then
    raise notice 'overgeslagen: public.medication bestaat niet (medication_write)';
  else
    execute $pol$drop policy if exists medication_write on public.medication$pol$;
    execute $pol$create policy medication_write on public.medication for all
      using (public.can_legacy(household_id, 'medication.write'))
      with check (public.can_legacy(household_id, 'medication.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.medication_log') is null then
    raise notice 'overgeslagen: public.medication_log bestaat niet (medication_log_read)';
  else
    execute $pol$drop policy if exists medication_log_read on public.medication_log$pol$;
    execute $pol$create policy medication_log_read on public.medication_log for select
      using (public.can_legacy(household_id, 'medication_log.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.medication_log') is null then
    raise notice 'overgeslagen: public.medication_log bestaat niet (medication_log_write)';
  else
    execute $pol$drop policy if exists medication_log_write on public.medication_log$pol$;
    execute $pol$create policy medication_log_write on public.medication_log for all
      using (public.can_legacy(household_id, 'medication_log.write'))
      with check (public.can_legacy(household_id, 'medication_log.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.medication_change') is null then
    raise notice 'overgeslagen: public.medication_change bestaat niet (medication_change_read)';
  else
    execute $pol$drop policy if exists medication_change_read on public.medication_change$pol$;
    execute $pol$create policy medication_change_read on public.medication_change for select
      using (public.can_legacy(household_id, 'medication_history.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.care_log') is null then
    raise notice 'overgeslagen: public.care_log bestaat niet (care_log_read)';
  else
    execute $pol$drop policy if exists care_log_read on public.care_log$pol$;
    execute $pol$create policy care_log_read on public.care_log for select
      using (public.can_legacy(household_id, 'care_log.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.care_log') is null then
    raise notice 'overgeslagen: public.care_log bestaat niet (care_log_insert)';
  else
    execute $pol$drop policy if exists care_log_insert on public.care_log$pol$;
    execute $pol$create policy care_log_insert on public.care_log for insert
      with check (public.can_legacy(household_id, 'care_log.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.care_log') is null then
    raise notice 'overgeslagen: public.care_log bestaat niet (care_log_delete)';
  else
    execute $pol$drop policy if exists care_log_delete on public.care_log$pol$;
    execute $pol$create policy care_log_delete on public.care_log for delete
      using (public.can_legacy(household_id, 'care_log.delete'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.care_log') is null then
    raise notice 'overgeslagen: public.care_log bestaat niet (care_log_update)';
  else
    execute $pol$drop policy if exists care_log_update on public.care_log$pol$;
    execute $pol$create policy care_log_update on public.care_log for update
      using (author_id = auth.uid() or public.can_legacy(household_id, 'care_log.update_any'))
      with check (author_id = auth.uid() or public.can_legacy(household_id, 'care_log.update_any'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.location_point') is null then
    raise notice 'overgeslagen: public.location_point bestaat niet (location_point_read)';
  else
    execute $pol$drop policy if exists location_point_read on public.location_point$pol$;
    execute $pol$create policy location_point_read on public.location_point for select
      using (public.can_legacy(household_id, 'location.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.quick_note') is null then
    raise notice 'overgeslagen: public.quick_note bestaat niet (quick_note_read)';
  else
    execute $pol$drop policy if exists quick_note_read on public.quick_note$pol$;
    execute $pol$create policy quick_note_read on public.quick_note for select
      using (public.is_self(household_id) or created_by = auth.uid() or public.can_legacy(household_id, 'quick_note.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.quick_note') is null then
    raise notice 'overgeslagen: public.quick_note bestaat niet (quick_note_insert)';
  else
    execute $pol$drop policy if exists quick_note_insert on public.quick_note$pol$;
    execute $pol$create policy quick_note_insert on public.quick_note for insert
      with check (public.can_legacy(household_id, 'quick_note.write') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.quick_note') is null then
    raise notice 'overgeslagen: public.quick_note bestaat niet (quick_note_delete)';
  else
    execute $pol$drop policy if exists quick_note_delete on public.quick_note$pol$;
    execute $pol$create policy quick_note_delete on public.quick_note for delete
      using (created_by = auth.uid() or public.can_legacy(household_id, 'quick_note.delete_any'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.life_story') is null then
    raise notice 'overgeslagen: public.life_story bestaat niet (life_story_read)';
  else
    execute $pol$drop policy if exists life_story_read on public.life_story$pol$;
    execute $pol$create policy life_story_read on public.life_story for select
      using (public.is_self(household_id) or created_by = auth.uid() or (public.can_legacy(household_id, 'diary.read') and shared))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.life_story') is null then
    raise notice 'overgeslagen: public.life_story bestaat niet (life_story_insert)';
  else
    execute $pol$drop policy if exists life_story_insert on public.life_story$pol$;
    execute $pol$create policy life_story_insert on public.life_story for insert
      with check (public.can_legacy(household_id, 'diary.write') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.life_story') is null then
    raise notice 'overgeslagen: public.life_story bestaat niet (life_story_delete)';
  else
    execute $pol$drop policy if exists life_story_delete on public.life_story$pol$;
    execute $pol$create policy life_story_delete on public.life_story for delete
      using (created_by = auth.uid() or public.can_legacy(household_id, 'diary.delete_any'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_read_family)';
  else
    execute $pol$drop policy if exists message_read_family on public.message$pol$;
    execute $pol$create policy message_read_family on public.message for select
      using (public.can_legacy(household_id, 'message.family.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_read_person)';
  else
    execute $pol$drop policy if exists message_read_person on public.message$pol$;
    execute $pol$create policy message_read_person on public.message for select
      using (channel = 'person' and public.can_legacy(household_id, 'message.resident.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_write_family)';
  else
    execute $pol$drop policy if exists message_write_family on public.message$pol$;
    execute $pol$create policy message_write_family on public.message for insert
      with check (channel = 'family' and public.can_legacy(household_id, 'message.family.write') and author_id = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_write_person)';
  else
    execute $pol$drop policy if exists message_write_person on public.message$pol$;
    execute $pol$create policy message_write_person on public.message for insert
      with check (channel = 'person' and public.can_legacy(household_id, 'message.resident.send') and author_id = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_delete_own)';
  else
    execute $pol$drop policy if exists message_delete_own on public.message$pol$;
    execute $pol$create policy message_delete_own on public.message for delete
      using (author_id = auth.uid() or public.can_legacy(household_id, 'message.moderate'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message') is null then
    raise notice 'overgeslagen: public.message bestaat niet (message_update_own)';
  else
    execute $pol$drop policy if exists message_update_own on public.message$pol$;
    execute $pol$create policy message_update_own on public.message for update
      using (author_id = auth.uid() or public.can_legacy(household_id, 'message.moderate'))
      with check (author_id = auth.uid() or public.can_legacy(household_id, 'message.moderate'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.message_read') is null then
    raise notice 'overgeslagen: public.message_read bestaat niet (message_read_select)';
  else
    execute $pol$drop policy if exists message_read_select on public.message_read$pol$;
    execute $pol$create policy message_read_select on public.message_read for select
      using (exists (select 1 from public.message m where m.id = message_read.message_id and public.can_legacy(m.household_id, 'message.read_receipts')))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.document') is null then
    raise notice 'overgeslagen: public.document bestaat niet (document_read)';
  else
    execute $pol$drop policy if exists document_read on public.document$pol$;
    execute $pol$create policy document_read on public.document for select
      using (public.can_legacy(household_id, 'document.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.document') is null then
    raise notice 'overgeslagen: public.document bestaat niet (document_write)';
  else
    execute $pol$drop policy if exists document_write on public.document$pol$;
    execute $pol$create policy document_write on public.document for all
      using (public.can_legacy(household_id, 'document.write'))
      with check (public.can_legacy(household_id, 'document.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.audit_log') is null then
    raise notice 'overgeslagen: public.audit_log bestaat niet (audit_read)';
  else
    execute $pol$drop policy if exists audit_read on public.audit_log$pol$;
    execute $pol$create policy audit_read on public.audit_log for select
      using (public.can_legacy(household_id, 'audit.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (avatars_read)';
  else
    execute $pol$drop policy if exists avatars_read on storage.objects$pol$;
    execute $pol$create policy avatars_read on storage.objects for select
      using (bucket_id = 'avatars' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (avatars_write)';
  else
    execute $pol$drop policy if exists avatars_write on storage.objects$pol$;
    execute $pol$create policy avatars_write on storage.objects for insert
      with check (bucket_id = 'avatars' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (avatars_delete)';
  else
    execute $pol$drop policy if exists avatars_delete on storage.objects$pol$;
    execute $pol$create policy avatars_delete on storage.objects for delete
      using (bucket_id = 'avatars' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (memories_read)';
  else
    execute $pol$drop policy if exists memories_read on storage.objects$pol$;
    execute $pol$create policy memories_read on storage.objects for select
      using (bucket_id = 'memories' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (memories_write)';
  else
    execute $pol$drop policy if exists memories_write on storage.objects$pol$;
    execute $pol$create policy memories_write on storage.objects for insert
      with check (bucket_id = 'memories' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (memories_delete)';
  else
    execute $pol$drop policy if exists memories_delete on storage.objects$pol$;
    execute $pol$create policy memories_delete on storage.objects for delete
      using (bucket_id = 'memories' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.memories.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (documents_read)';
  else
    execute $pol$drop policy if exists documents_read on storage.objects$pol$;
    execute $pol$create policy documents_read on storage.objects for select
      using (bucket_id = 'documents' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'document.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (documents_write)';
  else
    execute $pol$drop policy if exists documents_write on storage.objects$pol$;
    execute $pol$create policy documents_write on storage.objects for insert
      with check (bucket_id = 'documents' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'document.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (documents_delete)';
  else
    execute $pol$drop policy if exists documents_delete on storage.objects$pol$;
    execute $pol$create policy documents_delete on storage.objects for delete
      using (bucket_id = 'documents' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'document.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (messages_read)';
  else
    execute $pol$drop policy if exists messages_read on storage.objects$pol$;
    execute $pol$create policy messages_read on storage.objects for select
      using (bucket_id = 'messages' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.read') and ((storage.foldername(name))[2] <> 'family' or public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.family')) and ((storage.foldername(name))[2] is distinct from 'verhalen' or public.mag_opname_horen(((storage.foldername(name))[1])::uuid, name)))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (messages_write)';
  else
    execute $pol$drop policy if exists messages_write on storage.objects$pol$;
    execute $pol$create policy messages_write on storage.objects for insert
      with check (bucket_id = 'messages' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.write') and ((storage.foldername(name))[2] <> 'family' or public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.family')))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is null then
    raise notice 'overgeslagen: storage.objects bestaat niet (messages_delete)';
  else
    execute $pol$drop policy if exists messages_delete on storage.objects$pol$;
    execute $pol$create policy messages_delete on storage.objects for delete
      using (bucket_id = 'messages' and public.can_legacy(((storage.foldername(name))[1])::uuid, 'files.messages.delete'))$pol$;
  end if;
end $$;

