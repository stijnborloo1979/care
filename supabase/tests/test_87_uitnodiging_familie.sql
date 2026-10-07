-- =====================================================================
--  Familie uitnodigen (VEREIST_MIGRATIE 87)
--
--  De shim zet pgcrypto in het schema "extensions", zoals Supabase. Vóór
--  87 zakte deze test: create_invite vond gen_random_bytes niet.
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;
insert into auth.users (email) values ('u87-beheer@t'), ('u87-lid@t');
insert into t_ids select replace(replace(email, 'u87-', ''), '@t', ''), id from auth.users where email like 'u87-%@t';
insert into public.household (person_name) values ('Lucien Test') returning id \gset
insert into t_ids values ('hh', :'id');
insert into public.membership (household_id, profile_id, role)
  select h.v, b.v, 'admin' from t_ids h, t_ids b where h.k = 'hh' and b.k = 'beheer';
insert into public.membership (household_id, profile_id, role)
  select h.v, l.v, 'member' from t_ids h, t_ids l where h.k = 'hh' and l.k = 'lid';

create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.gelijk(wat text, kreeg anyelement, verwacht anyelement) returns void language plpgsql as $$
begin
  if kreeg is distinct from verwacht then raise exception 'GEZAKT: % — verwacht %, kreeg %', wat, verwacht, kreeg; end if;
  raise notice 'ok: %', wat;
end $$;
create function pg_temp.geweigerd(wat text, sql text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then raise notice 'ok: % (geweigerd: %)', wat, sqlerrm; return; end;
  raise exception 'GEZAKT: % — werd niet geweigerd', wat;
end $$;

set local role authenticated;

-- De familiebeheerder nodigt uit
select pg_temp.als('beheer');
create temp table t_inv as
  select * from public.create_invite(pg_temp.id('hh'), ' Tom@Voorbeeld.be ', 'member', 'Zoon');
select pg_temp.gelijk('uitnodiging gemaakt', (select count(*) from t_inv), 1::bigint);
select pg_temp.gelijk('token is URL-veilig en 32 tekens',
  (select token ~ '^[A-Za-z0-9_-]{32}$' from t_inv), true);
select pg_temp.gelijk('adres genormaliseerd',
  (select i.email from public.invitation i join t_inv using (id)), 'tom@voorbeeld.be'::text);
select pg_temp.gelijk('twee uitnodigingen, twee tokens',
  (select count(distinct token) from (select token from t_inv
     union all select token from public.create_invite(pg_temp.id('hh'), 'an@voorbeeld.be')) x), 2::bigint);

-- Een gewoon familielid niet
select pg_temp.als('lid');
select pg_temp.geweigerd('familielid mag niet uitnodigen',
  format('select public.create_invite(%L, %L)', pg_temp.id('hh'), 'x@voorbeeld.be'));

-- Geen geldig adres
select pg_temp.als('beheer');
select pg_temp.geweigerd('adres zonder @', format('select public.create_invite(%L, %L)', pg_temp.id('hh'), 'tom'));

-- De hulpfunctie is niet rechtstreeks aan te roepen
select pg_temp.geweigerd('uitnodiging_token niet voor ingelogden', 'select public.uitnodiging_token()');

reset role;
rollback;
