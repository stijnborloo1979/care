-- =====================================================================
--  LIFEANGLE — beveiligingsupdate
--  Supabase migratie, versie 47
--
--  Draai dit na 46_voice.sql. Terugdraaien: supabase/rollback/47_security_hotfix.sql
--  Tests: supabase/tests/test_47_security.sql
--
--  Waarom
--  ------
--  De audit van september 2026 vond lekken die los staan van Home/Care:
--
--    V1  Achtergrondfuncties (security definer, zonder toegangscontrole)
--        waren aanroepbaar voor iedereen met de anon-sleutel. Supabase geeft
--        standaard uitvoerrecht op elke functie in public. Daarmee kon je de
--        weetjes en Home Memory-teksten van alle huishoudens lezen, alle
--        locatiegeschiedenis wissen, of agenda-items in een vreemd
--        huishouden aanmaken.
--    V2  De storage-policy van 'documents' gebruikte auth_role(), die een
--        coördinator of org admin de rol 'member' geeft. Zij konden
--        documentbestanden oplijsten en downloaden; de tabel liet hen al niet
--        toe.
--    V3  Dagboekopnames (messages/<hh>/verhalen/) waren leesbaar voor
--        familie, ook als de bewoner het fragment privé hield.
--    V6  Functies die medicatiemomenten klaarzetten, waren aanroepbaar op
--        elk huishouden.
--
--  Wat er NIET verandert
--  ---------------------
--  - Cron (run_nightly) en de edge functions (embed, cleanup-storage)
--    draaien als postgres of service_role en werken zoals voorheen.
--  - De onboarding roept materialise_day() rechtstreeks aan. Die blijft
--    aanroepbaar voor wie beheerder of lid van het huishouden is.
--  - Familie ziet documenten en gedeelde opnames zoals voorheen; de bewoner
--    ziet al zijn eigen opnames.
-- =====================================================================


-- ---------------------------------------------------------------------
--  V1 en V6: alleen de server
--
--  Elke aanroeper van deze functies is zelf security definer (gecontroleerd
--  met pg_proc), dus intern blijven ze werken. Alleen de rechtstreekse
--  aanroep via de API verdwijnt.
-- ---------------------------------------------------------------------

do $$
declare
  f text;
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
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    exception when undefined_function then
      -- 09_ai.sql is optioneel; zonder die migratie bestaan de
      -- embeddingfuncties niet.
      raise notice 'overgeslagen, bestaat niet: %', f;
    end;
  end loop;
end
$$;


-- ---------------------------------------------------------------------
--  materialise_day: blijft aanroepbaar, maar alleen voor het eigen huis
--
--  De bestaande functie wordt hernoemd tot materialise_day_intern (body
--  ongewijzigd) en een dunne poort met dezelfde naam en handtekening
--  controleert wie aanroept. Zo hoeft de body niet gekopieerd te worden.
-- ---------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.materialise_day_intern(uuid, date)') is null then
    alter function public.materialise_day(uuid, date) rename to materialise_day_intern;
  end if;
end
$$;

revoke execute on function public.materialise_day_intern(uuid, date) from public, anon, authenticated;
grant execute on function public.materialise_day_intern(uuid, date) to service_role;

create or replace function public.materialise_day(hh uuid, on_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Zonder ingelogde gebruiker is dit de server: cron of een aanroep uit
  -- een andere security-definer-functie. anon heeft geen uitvoerrecht.
  if auth.uid() is not null
     and public.auth_role(hh) is distinct from 'admin'
     and public.auth_role(hh) is distinct from 'member' then
    raise exception 'Geen toegang tot dit huishouden' using errcode = '42501';
  end if;
  return public.materialise_day_intern(hh, on_day);
end;
$$;

revoke execute on function public.materialise_day(uuid, date) from public, anon;
grant execute on function public.materialise_day(uuid, date) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  V2: documentbestanden volgen de tabel
--
--  family_role() in plaats van auth_role(): alleen wie de familie zelf
--  toevoegde. Precies wat de tabel document al deed sinds 03.
-- ---------------------------------------------------------------------

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects for select
  using (
    bucket_id = 'documents'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
  );

drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and public.family_role(((storage.foldername(name))[1])::uuid) = 'admin'
  );

drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete
  using (
    bucket_id = 'documents'
    and public.family_role(((storage.foldername(name))[1])::uuid) = 'admin'
  );


-- ---------------------------------------------------------------------
--  V3: een opname volgt haar verhaal
--
--  Een bestand onder <hh>/verhalen/ is alleen leesbaar voor wie het
--  verhaal zelf mag lezen: de bewoner, wie het maakte, of — als het
--  gedeeld is — de familie. Dezelfde regel als life_story_read, maar
--  beperkt tot de rollen die de bucket al toeliet (geen zorgverleners).
-- ---------------------------------------------------------------------

create or replace function public.mag_opname_horen(hh uuid, pad text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_self(hh)
      or exists (
        select 1 from public.life_story ls
         where ls.household_id = hh
           and ls.audio_path = pad
           and (ls.created_by = auth.uid() or ls.shared)
      );
$$;

revoke execute on function public.mag_opname_horen(uuid, text) from public, anon;
grant execute on function public.mag_opname_horen(uuid, text) to authenticated, service_role;

drop policy if exists messages_read on storage.objects;
create policy messages_read on storage.objects for select
  using (
    bucket_id = 'messages'
    and public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member', 'person')
    and (
      (storage.foldername(name))[2] <> 'family'
      or public.family_role(((storage.foldername(name))[1])::uuid) in ('admin', 'member')
    )
    and (
      (storage.foldername(name))[2] is distinct from 'verhalen'
      or public.mag_opname_horen(((storage.foldername(name))[1])::uuid, name)
    )
  );
