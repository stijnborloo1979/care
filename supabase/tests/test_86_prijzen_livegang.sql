-- =====================================================================
--  Het aanbod bij de livegang (VEREIST_MIGRATIE 86)
-- =====================================================================
begin;

create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

set local role anon;
select pg_temp.gelijk('twee plannen op de prijspagina',
  (select string_agg(id, ',' order by id) from public.publieke_prijzen()), 'care,home'::text);
select pg_temp.gelijk('Home: 14,95 per maand', (select prijs_maand_cent from public.publieke_prijzen() where id = 'home'), 1495);
select pg_temp.gelijk('Home: 149 per jaar', (select prijs_jaar_cent from public.publieke_prijzen() where id = 'home'), 14900);
select pg_temp.gelijk('Home: 14 dagen gratis', (select proefdagen from public.publieke_prijzen() where id = 'home'), 14);
select pg_temp.gelijk('Home: btw inbegrepen', (select btw_inbegrepen from public.publieke_prijzen() where id = 'home'), true);
select pg_temp.gelijk('Home: spraakassistent inbegrepen',
  (select 'Spraak met AI' = any (onderdelen) from public.publieke_prijzen() where id = 'home'), true);
select pg_temp.gelijk('Home: medicatie nog altijd inbegrepen',
  (select 'Medicatie' = any (onderdelen) from public.publieke_prijzen() where id = 'home'), true);
select pg_temp.gelijk('Care: prijs op aanvraag', (select prijs_op_aanvraag from public.publieke_prijzen() where id = 'care'), true);
select pg_temp.gelijk('Care: geen bedrag', (select prijs_maand_cent from public.publieke_prijzen() where id = 'care'), null::integer);
select pg_temp.gelijk('geen voorstel meer', (select bool_or(voorstel) from public.publieke_prijzen()), false);
reset role;

select pg_temp.gelijk('terugval home_free bestaat nog', (select count(*) from public.plan where id = 'home_free'), 1::bigint);
select pg_temp.gelijk('geen dubbele onderdelen in Home',
  (select cardinality(entitlements) = cardinality(array(select distinct unnest(entitlements))) from public.plan where id = 'home'), true);
select pg_temp.gelijk('systeemcontrole kent 86',
  (select aanwezig from public.systeem_controle() where migratie = 86), true);

rollback;
