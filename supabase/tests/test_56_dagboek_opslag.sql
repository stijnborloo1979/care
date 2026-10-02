-- =====================================================================
--  Eigen opslag voor verhalen en dagboek (VEREIST_MIGRATIE 56)
-- =====================================================================
begin;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to public;

do $$
declare hh uuid; hh2 uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'd-fa@t', 'd-fm@t', 'd-cg@t', 'd-tablet@t', 'd-x@t']) m;
  insert into t_ids select replace(replace(email, 'd-', ''), '@t', ''), id from auth.users where email like 'd-%@t';
  insert into public.household (person_name, timezone, support_level) values ('Maria', 'Europe/Brussels', 'ondersteund') returning id into hh;
  insert into public.household (person_name, timezone) values ('Ander', 'Europe/Brussels') returning id into hh2;
  insert into t_ids values ('hh', hh), ('hh2', hh2);
  insert into public.membership (household_id, profile_id, role) values
    (hh, (select v from t_ids where k = 'fa'), 'admin'),
    (hh, (select v from t_ids where k = 'fm'), 'member'),
    (hh, (select v from t_ids where k = 'cg'), 'caregiver'),
    (hh, (select v from t_ids where k = 'tablet'), 'person'),
    (hh2, (select v from t_ids where k = 'x'), 'admin');
  insert into public.person_card (household_id, profile_id, name, relation, kind)
    values (hh, (select v from t_ids where k = 'tablet'), 'Maria', 'jij', 'self');
end $$;

create function pg_temp.als(k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select v from t_ids where t_ids.k = als.k), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.id(k text) returns uuid language sql stable as $$ select v from t_ids where t_ids.k = id.k $$;
create function pg_temp.pad(f text) returns text language sql stable as $$ select pg_temp.id('hh')::text || '/' || f $$;
create function pg_temp.gelijk(wat text, kreeg bigint, verwacht bigint) returns void language plpgsql as $$
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
create function pg_temp.upload(f text) returns text language sql as $$
  select format('insert into storage.objects (bucket_id, name) values (''diary'', %L)', pg_temp.pad(f))
$$;
create function pg_temp.zichtbaar() returns bigint language sql as $$
  select count(*) from storage.objects where bucket_id = 'diary'
$$;
create function pg_temp.bestaat(f text) returns bigint language sql security definer as $$
  select count(*) from storage.objects where bucket_id = 'diary' and name = pg_temp.pad(f)
$$;

select pg_temp.gelijk('de bucket diary bestaat en is privé',
  (select count(*) from storage.buckets where id = 'diary' and not public), 1);
select pg_temp.gelijk('bestaande verhalen blijven in messages',
  (select count(*) from information_schema.columns where table_name = 'life_story' and column_name = 'audio_bucket' and column_default like '%messages%'), 1);

set local role authenticated;

-- Opnemen
select pg_temp.als('fm');
select pg_temp.geweigerd('geen opname zonder verhaal', pg_temp.upload('los.webm'));
insert into public.life_story (household_id, question, audio_path, audio_bucket, shared, created_by)
  values (pg_temp.id('hh'), 'Gedeeld', pg_temp.pad('a.webm'), 'diary', true, pg_temp.id('fm'));
select pg_temp.upload('a.webm') \gexec
insert into public.life_story (household_id, question, audio_path, audio_bucket, shared, created_by)
  values (pg_temp.id('hh'), 'Sub', pg_temp.pad('sub/b.webm'), 'diary', true, pg_temp.id('fm'));
select pg_temp.geweigerd('geen submappen', pg_temp.upload('sub/b.webm'));
reset role;
delete from public.life_story where question = 'Sub';
set local role authenticated;
select pg_temp.als('fm');
select pg_temp.als('cg');
select pg_temp.geweigerd('zorgverlener neemt geen verhaal op (zoals vandaag)', pg_temp.upload('c.webm'));
select pg_temp.als('x');
select pg_temp.geweigerd('ander huishouden schrijft niet in deze map', pg_temp.upload('d.webm'));
select pg_temp.geweigerd('een verhaal dat naar de opname van een ander huishouden wijst',
  format('insert into public.life_story (household_id, question, audio_path, audio_bucket, shared, created_by) values (%L::uuid, ''x'', %L, ''diary'', true, %L::uuid)',
         pg_temp.id('hh2'), pg_temp.pad('a.webm'), pg_temp.id('x')));

-- De tablet neemt een privé-fragment op
select pg_temp.als('tablet');
insert into public.life_story (household_id, question, audio_path, audio_bucket, shared, created_by, soort)
  values (pg_temp.id('hh'), 'Prive', pg_temp.pad('prive.webm'), 'diary', false, pg_temp.id('tablet'), 'dagboek');
select pg_temp.upload('prive.webm') \gexec
select pg_temp.als('fm');
select pg_temp.geweigerd('geen opname bij het verhaal van een ander', pg_temp.upload('prive.webm'));
select pg_temp.als('tablet');

-- Beluisteren: wie het verhaal ziet en vandaag opnames mag horen
select pg_temp.gelijk('tablet hoort beide', pg_temp.zichtbaar(), 2);
select pg_temp.als('fa');
select pg_temp.gelijk('familiebeheerder hoort het gedeelde, niet het privé-fragment', pg_temp.zichtbaar(), 1);
select pg_temp.als('fm');
select pg_temp.gelijk('familielid hoort het gedeelde', pg_temp.zichtbaar(), 1);
select pg_temp.als('cg');
select pg_temp.gelijk('zorgverlener hoort geen opnames (zoals vandaag)', pg_temp.zichtbaar(), 0);
select pg_temp.als('x');
select pg_temp.gelijk('ander huishouden hoort niets', pg_temp.zichtbaar(), 0);

-- Bewoner zet het gedeelde verhaal op privé: familie hoort het niet meer
reset role;
update public.life_story set shared = false where question = 'Gedeeld';
set local role authenticated;
select pg_temp.als('fa');
select pg_temp.gelijk('privé gezet: familiebeheerder hoort het niet meer', pg_temp.zichtbaar(), 0);
reset role;
update public.life_story set shared = true where question = 'Gedeeld';
set local role authenticated;

-- Wissen
select pg_temp.als('cg');
delete from storage.objects where bucket_id = 'diary';
select pg_temp.als('x');
delete from storage.objects where bucket_id = 'diary';
reset role;
select pg_temp.gelijk('zorgverlener en ander huishouden wissen niets', pg_temp.bestaat('a.webm') + pg_temp.bestaat('prive.webm'), 2);
set local role authenticated;

select pg_temp.als('fm');
delete from storage.objects where bucket_id = 'diary' and name = pg_temp.pad('prive.webm');
select pg_temp.gelijk('familielid wist het fragment van een ander niet', pg_temp.bestaat('prive.webm'), 1);
select pg_temp.als('fa');
delete from storage.objects where bucket_id = 'diary' and name = pg_temp.pad('prive.webm');
select pg_temp.gelijk('familiebeheerder wist geen privé-fragment dat hij niet ziet (zoals vandaag)', pg_temp.bestaat('prive.webm'), 1);
delete from storage.objects where bucket_id = 'diary' and name = pg_temp.pad('a.webm');
select pg_temp.gelijk('familiebeheerder wist een gedeeld verhaal van een ander (zoals vandaag)', pg_temp.bestaat('a.webm'), 0);
select pg_temp.als('tablet');
select pg_temp.gelijk('open_verhaal_opname werkt ook voor diary',
  (select count(*) from public.life_story ls, public.open_verhaal_opname(ls.id) p where ls.audio_bucket = 'diary' and p = ls.audio_path), 2);
delete from storage.objects where bucket_id = 'diary' and name = pg_temp.pad('prive.webm');
select pg_temp.gelijk('de bewoner wist haar eigen fragment', pg_temp.bestaat('prive.webm'), 0);
reset role;

rollback;
