-- =====================================================================
--  Policytest bij migraties 50 en 51 (VEREIST_MIGRATIE 51)
--
--  Meet voor 10 soorten gebruikers, 8 huishoudens en elke omgezette tabel
--  (plus de vier buckets) wat iemand kan: lezen (aantal rijen), wijzigen,
--  wissen en toevoegen. Eerst met de nieuwe policies (na 50/51), daarna
--  met de oude (via de rollback-scripts), en vergelijkt. Eis: identiek.
--
--  Zo zijn meteen ook de rollback-scripts getest. Alles wordt
--  teruggedraaid.
-- =====================================================================

begin;

create temp table t_hh (nr int primary key, id uuid);
create temp table t_user (mail text primary key, id uuid);
create temp table t_rij (tabel text, nr int, rij tid, sjabloon jsonb);
create temp table t_uit (fase text, wie text, tabel text, nr int, actie text, uitkomst text);
grant select on t_hh, t_user, t_rij to public;
grant select, insert on t_uit to public;

-- ---------------------------------------------------------------------
--  Opzet
-- ---------------------------------------------------------------------
do $$
declare
  org uuid; i int; hh uuid; med uuid; msg uuid; noti uuid;
  niveaus text[] := array['zelf', 'samen', 'ondersteund'];
  u_admin uuid;
begin
  insert into auth.users (email) select m from unnest(array[
    'q-self@t', 'q-admin@t', 'q-member@t', 'q-care@t', 'q-tablet@t',
    'q-vreemd@t', 'q-orgadmin@t', 'q-coord@t', 'q-orgcare@t', 'q-coordlid@t']) m;
  insert into t_user select email, id from auth.users where email like 'q-%@t';
  select id into u_admin from t_user where mail = 'q-admin@t';

  insert into public.organisation (name) values ('Policy WZC') returning id into org;
  insert into public.org_membership (org_id, profile_id, role)
  select org, u.id, r::public.org_role from (values
    ('q-orgadmin@t', 'org_admin'), ('q-coord@t', 'coordinator'),
    ('q-orgcare@t', 'caregiver'), ('q-coordlid@t', 'coordinator')) v(mail, r)
  join t_user u on u.mail = v.mail;

  for i in 1..8 loop
    insert into public.household (person_name, timezone, support_level, share_quick_notes, org_id)
    values ('Q' || i, 'Europe/Brussels', niveaus[1 + (i - 1) % 3], (i % 2 = 0),
            case when i in (2, 4, 6, 8) then org end)
    returning id into hh;
    insert into t_hh values (i, hh);

    insert into public.membership (household_id, profile_id, role)
    select hh, u.id, r::public.member_role from (values
      ('q-self@t', 'admin'), ('q-admin@t', 'admin'), ('q-member@t', 'member'),
      ('q-care@t', 'caregiver'), ('q-tablet@t', 'person'), ('q-coordlid@t', 'member')) v(mail, r)
    join t_user u on u.mail = v.mail;
    insert into public.person_card (household_id, name, relation, kind, profile_id)
    select hh, 'Q' || i, 'ikzelf', 'self', id from t_user
     where mail = case when i <= 6 then 'q-self@t' else 'q-tablet@t' end;

    -- Eén rij per tabel, gemaakt door de familiebeheerder
    insert into public.person_card (household_id, name, relation, kind) values (hh, 'Els', 'dochter', 'family');
    insert into public.routine (household_id, name) values (hh, 'Ochtend');
    insert into public.routine_step (routine_id, household_id, at_time, title)
      select id, hh, '08:00', 'Ontbijt' from public.routine where household_id = hh limit 1;
    insert into public.agenda_event (household_id, starts_at, title, kind, created_by) values
      (hh, now() + interval '1 day', 'Dokter', 'appt', u_admin),
      (hh, now() + interval '2 day', 'Verzorging', 'appt', (select id from t_user where mail = 'q-care@t'));
    insert into public.memory_note (household_id, category, title, body) values (hh, 'dingen', 'Sleutel', 'Bij de buren');
    insert into public.memory_photo (household_id, title) values (hh, 'Huwelijk');
    insert into public.medication (household_id, name, at_time) values (hh, 'Pil', '08:00') returning id into med;
    insert into public.medication_log (medication_id, household_id, due_at) values (med, hh, now() + interval '3 hour')
      on conflict do nothing;
    insert into public.medication_change (household_id, medication_name, veld) values (hh, 'Pil', 'dosis');
    insert into public.care_log (household_id, title, author_id) values (hh, 'Goed geslapen', u_admin);
    insert into public.location_setting (household_id) values (hh) on conflict do nothing;
    insert into public.location_point (household_id, lat, lng) values (hh, 50.8, 4.3);
    insert into public.quick_note (household_id, body, created_by) values (hh, 'Bril ligt op de kast', u_admin);
    insert into public.life_story (household_id, question, body, shared, created_by) values
      (hh, 'Vertel eens', 'Gedeeld', true, u_admin), (hh, 'Vertel eens', 'Privé', false, u_admin);
    insert into public.message (household_id, channel, body, author_id) values (hh, 'family', 'Wie gaat er?', u_admin)
      returning id into msg;
    insert into public.message (household_id, channel, body, author_id) values (hh, 'person', 'Dag mama', u_admin);
    insert into public.message_read (message_id, profile_id) values (msg, u_admin);
    insert into public.document (household_id, category, name) values (hh, 'identiteit', 'ID');
    insert into public.radio_station (household_id, name, stream_url) values (hh, 'Klara', 'https://example.org/klara');
    insert into public.shopping_item (household_id, name, created_by) values (hh, 'melk', u_admin);
    insert into public.task (household_id, title) values (hh, 'Apotheek');
    insert into public.voice_action (action_id, household_id, intent) values (gen_random_uuid(), hh, 'shopping');
    insert into public.call (household_id) values (hh);
    insert into public.notification (household_id, body) values (hh, 'Test') returning id into noti;
    insert into public.notification_delivery (notification_id, profile_id, kind) values (noti, u_admin, 'mail');
    insert into public.push_subscription (profile_id, household_id, endpoint, p256dh, auth_key)
      values (u_admin, hh, 'https://push.example/' || hh, 'k', 'a');
    insert into public.device_pairing (household_id, code) values (hh, substr(md5(hh::text), 1, 8));
    insert into public.invitation (household_id, email, token) values (hh, 'x@t', md5(hh::text));
    insert into public.audit_log (household_id, table_name, action) values (hh, 'document', 'INSERT');

    insert into storage.objects (bucket_id, name) values
      ('avatars',   hh || '/a.jpg'),
      ('memories',  hh || '/m.jpg'),
      ('documents', hh || '/d.pdf'),
      ('messages',  hh || '/person/p.webm'),
      ('messages',  hh || '/family/f.webm'),
      ('messages',  hh || '/verhalen/v.webm');
    insert into public.life_story (household_id, question, audio_path, shared, created_by)
      values (hh, 'Dagboek', hh || '/verhalen/v.webm', (i % 2 = 1), u_admin);
  end loop;

  -- alert_channel is per profiel uniek per soort: één rij
  insert into public.alert_channel (household_id, profile_id, kind, address)
    values ((select id from t_hh where nr = 1), u_admin, 'telegram', '123');
end $$;

-- De tabellen die 50 en 51 omzetten, met hoe je een rij bij een huishouden vindt
create temp table t_tabel (tabel text primary key, hhkol text);
grant select on t_tabel to public;
insert into t_tabel values
  ('public.radio_station', 'household_id'), ('public.shopping_item', 'household_id'),
  ('public.task', 'household_id'), ('public.voice_action', 'household_id'),
  ('public.call', 'household_id'), ('public.location_setting', 'household_id'),
  ('public.routine', 'household_id'), ('public.routine_step', 'household_id'),
  ('public.person_card', 'household_id'), ('public.agenda_event', 'household_id'),
  ('public.memory_note', 'household_id'), ('public.memory_photo', 'household_id'),
  ('public.notification', 'household_id'), ('public.push_subscription', 'household_id'),
  ('public.alert_channel', 'household_id'), ('public.device_pairing', 'household_id'),
  ('public.consent', 'household_id'), ('public.consent_history', 'household_id'),
  ('public.household', 'id'), ('public.membership', 'household_id'),
  ('public.invitation', 'household_id'),
  ('public.medication', 'household_id'), ('public.medication_log', 'household_id'),
  ('public.medication_change', 'household_id'), ('public.care_log', 'household_id'),
  ('public.location_point', 'household_id'), ('public.quick_note', 'household_id'),
  ('public.life_story', 'household_id'), ('public.message', 'household_id'),
  ('public.document', 'household_id'), ('public.audit_log', 'household_id'),
  ('public.notification_delivery', '(select n.household_id from public.notification n where n.id = notification_id)'),
  ('public.message_read', '(select m.household_id from public.message m where m.id = message_id)'),
  ('storage.objects', '((storage.foldername(name))[1])::uuid');

-- Per tabel en huishouden: welke rijen (ctid) en een sjabloon om toe te voegen
do $$
declare t record; h record; r record;
begin
  for t in select * from t_tabel loop
    for h in select * from t_hh loop
      for r in execute format('select ctid as rij, to_jsonb(x) as j from %s x where %s = %L', t.tabel, t.hhkol, h.id) loop
        insert into t_rij values (t.tabel, h.nr, r.rij, r.j);
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  Meten
-- ---------------------------------------------------------------------
create function pg_temp.meet(fase text) returns void language plpgsql as $$
declare
  u record; t record; h record;
  n bigint; tids tid[]; sj jsonb; kols text; uitkomst text;
  eerste text;
begin
  for u in select * from t_user order by mail loop
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    for t in select * from t_tabel order by tabel loop
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
             min(quote_ident(column_name)) filter (where ordinal_position = 1)
        into kols, eerste
        from information_schema.columns
       where table_schema || '.' || table_name = t.tabel
         and is_identity = 'NO' and is_generated = 'NEVER';
      for h in select * from t_hh order by nr loop
        select array_agg(rij), (array_agg(sjabloon))[1] into tids, sj from t_rij where tabel = t.tabel and nr = h.nr;
        if tids is null then continue; end if;

        execute 'set local role authenticated';

        -- lezen
        execute format('select count(*) from %s where ctid = any($1)', t.tabel) into n using tids;
        insert into t_uit values (fase, u.mail, t.tabel, h.nr, 'lezen', n::text);

        -- wijzigen (zonder iets te veranderen), daarna ongedaan
        begin
          execute format('update %s set %s = %s where ctid = any($1)', t.tabel, eerste, eerste) using tids;
          get diagnostics n = row_count;
          uitkomst := n::text;
          raise exception using errcode = 'LA001';
        exception
          when sqlstate 'LA001' then null;
          when others then uitkomst := 'fout ' || sqlstate;
        end;
        insert into t_uit values (fase, u.mail, t.tabel, h.nr, 'wijzigen', uitkomst);

        -- wissen, daarna ongedaan
        begin
          execute format('delete from %s where ctid = any($1)', t.tabel) using tids;
          get diagnostics n = row_count;
          uitkomst := n::text;
          raise exception using errcode = 'LA001';
        exception
          when sqlstate 'LA001' then null;
          when others then uitkomst := 'fout ' || sqlstate;
        end;
        insert into t_uit values (fase, u.mail, t.tabel, h.nr, 'wissen', uitkomst);

        -- toevoegen: een kopie van de eerste rij, als deze gebruiker
        sj := sj - 'id' - 'created_at';
        if sj ? 'created_by' then sj := sj || jsonb_build_object('created_by', u.id); end if;
        if sj ? 'author_id'  then sj := sj || jsonb_build_object('author_id', u.id); end if;
        if sj ? 'profile_id' then sj := sj || jsonb_build_object('profile_id', u.id); end if;
        if sj ? 'action_id'  then sj := sj || jsonb_build_object('action_id', gen_random_uuid()); end if;
        if sj ? 'endpoint'   then sj := sj || jsonb_build_object('endpoint', 'https://push.example/' || gen_random_uuid()); end if;
        if sj ? 'code'       then sj := sj || jsonb_build_object('code', substr(md5(random()::text), 1, 8)); end if;
        if sj ? 'token'      then sj := sj || jsonb_build_object('token', md5(random()::text)); end if;
        if t.tabel = 'storage.objects' then sj := sj || jsonb_build_object('name', (sj ->> 'name') || '.kopie'); end if;
        begin
          execute format('insert into %1$s (%2$s) select %2$s from jsonb_populate_record(null::%1$s, $1)', t.tabel,
            (select string_agg(k, ', ') from unnest(string_to_array(kols, ', ')) k
              where trim(both '"' from k) in (select jsonb_object_keys(sj)))) using sj;
          uitkomst := 'ok';
          raise exception using errcode = 'LA001';
        exception
          when sqlstate 'LA001' then null;
          when others then uitkomst := case when sqlstate = '42501' then 'rls' else 'fout ' || sqlstate end;
        end;
        insert into t_uit values (fase, u.mail, t.tabel, h.nr, 'toevoegen', uitkomst);

        execute 'reset role';
      end loop;
    end loop;
  end loop;
end $$;

select pg_temp.meet('na');

-- Terug naar de policies van vóór 50 en 51
\ir ../rollback/51_policies_groep2.sql
\ir ../rollback/50_policies_groep1.sql

select pg_temp.meet('voor');

-- ---------------------------------------------------------------------
--  Vergelijken
-- ---------------------------------------------------------------------
do $$
declare
  totaal int; verschil int; rij record; ok_lezen int; weigert int;
begin
  select count(*) into totaal from t_uit where fase = 'na';
  select count(*) into verschil
    from t_uit a full join t_uit b
      on b.fase = 'voor' and a.wie = b.wie and a.tabel = b.tabel and a.nr = b.nr and a.actie = b.actie
   where (a.fase = 'na' or a.fase is null) and (b.fase = 'voor' or b.fase is null)
     and (a.uitkomst is distinct from b.uitkomst);
  -- Zinvolheid: de meting moet zowel toegang als weigering zien.
  select count(*) into ok_lezen from t_uit where fase = 'na' and actie = 'lezen' and uitkomst <> '0';
  select count(*) into weigert  from t_uit where fase = 'na' and actie = 'toevoegen' and uitkomst = 'rls';
  if ok_lezen = 0 or weigert = 0 then
    raise exception 'GEZAKT: de meting ziet geen verschil tussen toegang en weigering (% / %)', ok_lezen, weigert;
  end if;
  if verschil > 0 then
    for rij in
      select a.wie, a.tabel, a.nr, a.actie, a.uitkomst as na, b.uitkomst as voor
        from t_uit a join t_uit b
          on b.fase = 'voor' and a.wie = b.wie and a.tabel = b.tabel and a.nr = b.nr and a.actie = b.actie
       where a.fase = 'na' and a.uitkomst is distinct from b.uitkomst
       order by 2, 4, 1, 3 limit 30
    loop
      raise notice 'verschil: % · % · H% · % — voor %, na %', rij.wie, rij.tabel, rij.nr, rij.actie, rij.voor, rij.na;
    end loop;
    raise exception 'GEZAKT: % verschillen op % metingen', verschil, totaal;
  end if;
  raise notice 'ok: policies vóór en na 50/51 gelijk — % metingen (%  keer toegang tot rijen, % geweigerde toevoegingen)', totaal, ok_lezen, weigert;
end $$;

rollback;
