-- =====================================================================
--  Prijzen (VEREIST_MIGRATIE 77)
-- =====================================================================
begin;

create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;

-- Anoniem ziet de prijzen, niet de tabel
set local role anon;
select pg_temp.gelijk('anoniem ziet vijf plannen', (select count(*) from public.publieke_prijzen()), 5::bigint);
select pg_temp.gelijk('Home kost 9,99 per maand', (select prijs_maand_cent from public.publieke_prijzen() where id = 'home'), 999);
select pg_temp.gelijk('Care per bewoner, excl. btw',
  (select eenheid || '/' || btw_inbegrepen::text from public.publieke_prijzen() where id = 'care'), 'bewoner/false'::text);
select pg_temp.gelijk('onderdelen als leesbare namen',
  (select 'Medicatie' = any (onderdelen) from public.publieke_prijzen() where id = 'home'), true);
select pg_temp.gelijk('nog een voorstel', (select bool_and(voorstel) from public.publieke_prijzen()), true);
do $$
begin
  begin
    perform count(*) from public.plan;
    raise exception 'GEZAKT: anoniem las de tabel plan';
  exception when insufficient_privilege then raise notice 'ok: tabel plan blijft dicht voor anoniem';
  end;
end $$;
reset role;

-- Een eigen prijs blijft staan als 77 opnieuw draait
update public.plan set prijs_maand_cent = 1099 where id = 'home';
update public.plan p set prijs_maand_cent = coalesce(p.prijs_maand_cent, 999) where p.id = 'home';
select pg_temp.gelijk('eigen prijs blijft', (select prijs_maand_cent from public.plan where id = 'home'), 1099);

-- Verborgen plannen niet op de prijspagina
update public.plan set zichtbaar = false where id = 'care_ai';
select pg_temp.gelijk('verborgen plan niet zichtbaar', (select count(*) from public.publieke_prijzen() where id = 'care_ai'), 0::bigint);

rollback;
