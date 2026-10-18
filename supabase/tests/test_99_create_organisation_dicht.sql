-- =====================================================================
--  create_organisation is dicht voor gebruikers (VEREIST_MIGRATIE 99)
-- =====================================================================
begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.create_organisation(text, text)', 'EXECUTE') then
    raise exception 'GEZAKT: authenticated mag nog een WZC aanmaken';
  end if;
  if has_function_privilege('anon', 'public.create_organisation(text, text)', 'EXECUTE') then
    raise exception 'GEZAKT: anon mag een WZC aanmaken';
  end if;
  raise notice 'ok: create_organisation is dicht voor gebruikers en anonieme bezoekers';
end $$;

rollback;
