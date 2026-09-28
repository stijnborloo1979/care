-- Terugdraaien van 49_can_legacy.sql. Veilig zolang geen policy
-- can_legacy() gebruikt (dus vóór migratie 50).
drop function if exists public.my_access(uuid);
drop function if exists public.can_legacy(uuid, text);
drop function if exists public.consented(uuid, text[]);
drop function if exists public.legacy_relations(uuid);
