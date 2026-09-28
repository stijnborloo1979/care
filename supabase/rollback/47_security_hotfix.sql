-- Terugdraaien van 47_security_hotfix.sql. Zet de toestand van na 46 terug,
-- INCLUSIEF de lekken. Alleen gebruiken als 47 iets breekt dat niet anders
-- op te lossen is, en dan zo kort mogelijk.

drop function if exists public.materialise_day(uuid, date);
alter function public.materialise_day_intern(uuid, date) rename to materialise_day;
grant execute on function public.materialise_day(uuid, date) to public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.pending_embeddings(integer)',
    'public.set_embedding(text, uuid, extensions.vector)',
    'public.run_nightly()',
    'public.run_nightly_full()',
    'public.check_household_alerts(uuid)',
    'public.cleanup_location(integer)',
    'public.cleanup_expired_messages()',
    'public.ensure_medication_log(uuid, date)',
    'public.med_items_klaarzetten(uuid, timestamptz)',
    'public.med_doses_bij(uuid)'
  ]
  loop
    begin
      execute format('grant execute on function %s to public, anon, authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
end
$$;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select
  using (bucket_id = 'documents'
         and public.auth_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member'));
drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert
  with check (bucket_id = 'documents'
              and public.auth_role(((storage.foldername(name))[1])::uuid) = 'admin');
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete
  using (bucket_id = 'documents'
         and public.auth_role(((storage.foldername(name))[1])::uuid) = 'admin');

drop policy if exists messages_read on storage.objects;
create policy messages_read on storage.objects for select
  using (
    bucket_id = 'messages'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member', 'person')
    and (
      (storage.foldername(name))[2] <> 'family'
      or public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
    )
  );
drop function if exists public.mag_opname_horen(uuid, text);
