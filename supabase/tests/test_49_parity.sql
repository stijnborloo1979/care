-- =====================================================================
--  Pariteitstest: can_legacy() tegenover de huidige policies
--  (VEREIST_MIGRATIE 49)
--
--  Voor elke testgebruiker × elk huishouden × elke permissie wordt de
--  uitdrukking uit de huidige policy (letterlijk overgenomen in
--  legacy_rule) vergeleken met can_legacy(). Eis: nul verschillen.
--
--  Daarna worden alle ondersteuningsfasen en de deelkeuze voor notities
--  gewisseld, en gebeurt de vergelijking opnieuw: zo is ook de trigger die
--  consent bijhoudt getest.
--
--  Nieuwe permissie in 48? Dan hoort hier een regel bij, anders faalt de
--  controle "elke permissie heeft een regel".
-- =====================================================================

begin;

create temp table legacy_rule (perm text primary key, expr text not null);
grant select on legacy_rule to public;

insert into legacy_rule (perm, expr)
select k, 'public.is_member(hh)' from unnest(array[
  'household.read', 'agenda.read', 'people.read', 'routine.read', 'notes.read',
  'memories.read', 'medication.read', 'diary.read', 'call.read', 'location_setting.read',
  'radio.read', 'shopping.read', 'voice_action.read', 'notification.read',
  'membership.read', 'consent.read', 'files.memories.read']) k
union all
select k, 'public.auth_role(hh) in (''admin'', ''member'')' from unnest(array[
  'agenda.write', 'people.write', 'routine.write', 'notes.write', 'memories.write',
  'medication.write', 'radio.write', 'task.manage', 'device.read',
  'notification_delivery.read', 'files.memories.write']) k
union all
select k, 'public.auth_role(hh) = ''admin''' from unnest(array[
  'household.write', 'membership.manage', 'location_setting.write', 'care_log.delete',
  'diary.delete_any', 'quick_note.delete_any']) k
union all
select k, 'public.auth_role(hh) in (''admin'', ''member'', ''person'')' from unnest(array[
  'diary.write', 'quick_note.write', 'shopping.write']) k
union all
select 'care_log.write',   'public.auth_role(hh) in (''admin'', ''member'', ''caregiver'')'
union all
select 'agenda.write_own', 'public.auth_role(hh) = ''caregiver'''
union all
select k, 'public.family_role(hh) in (''admin'', ''member'')' from unnest(array[
  'document.read', 'message.family.read', 'message.family.write', 'files.messages.family']) k
union all
select k, 'public.family_role(hh) = ''admin''' from unnest(array[
  'document.write', 'audit.read', 'invitation.manage', 'message.moderate']) k
union all
select k, 'public.family_role(hh) in (''admin'', ''member'', ''person'')' from unnest(array[
  'message.resident.send', 'files.messages.read']) k
union all
select 'message.resident.read', 'public.family_role(hh) = ''person'''
union all
select k, 'public.mag_meekijken(hh)' from unnest(array[
  'care_log.read', 'medication_log.read', 'location.read']) k
union all
select k, 'public.is_member(hh)' from unnest(array['notification.update', 'push.subscribe', 'message.read_receipts']) k
union all
select k, 'public.auth_role(hh) in (''admin'', ''member'')' from unnest(array['shopping.delete_any', 'alert_channel.write', 'medication_log.write']) k
union all
select 'care_log.update_any', 'public.auth_role(hh) = ''admin'''
union all
select 'consent.history.read', 'public.is_self(hh) or public.family_role(hh) = ''admin'''
union all
select 'medication_history.read', 'public.mag_meekijken(hh)'
union all
select 'files.messages.write', 'public.family_role(hh) in (''admin'', ''member'', ''person'')'
union all
select 'files.messages.delete', 'public.family_role(hh) in (''admin'', ''member'')'
union all
select 'quick_note.read', 'public.is_self(hh) or (public.mag_meekijken(hh) and exists (select 1 from public.household h where h.id = hh and h.share_quick_notes))';

create temp table t_hh (nr int primary key, id uuid);
create temp table t_user (mail text primary key, id uuid);
create temp table t_mis (wie text, hh int, perm text, oud boolean, nieuw boolean, ronde int);
create temp table t_tel (ronde int, n int);
grant select on t_hh, t_user to public;
grant select, insert on t_mis, t_tel to public;

-- ---------------------------------------------------------------------
--  Opzet: 8 huishoudens, 10 gebruikers
-- ---------------------------------------------------------------------
do $$
declare
  org uuid;
  u record;
  i int;
  hh uuid;
  niveaus text[] := array['zelf', 'samen', 'ondersteund'];
begin
  insert into auth.users (email) select m from unnest(array[
    'p-self@t', 'p-admin@t', 'p-member@t', 'p-care@t', 'p-tablet@t',
    'p-vreemd@t', 'p-orgadmin@t', 'p-coord@t', 'p-orgcare@t', 'p-coordlid@t']) m;
  insert into t_user select email, id from auth.users where email like 'p-%@t';

  insert into public.organisation (name) values ('Parity WZC') returning id into org;
  insert into public.org_membership (org_id, profile_id, role)
  select org, id, r::public.org_role from (values
    ('p-orgadmin@t', 'org_admin'), ('p-coord@t', 'coordinator'),
    ('p-orgcare@t', 'caregiver'), ('p-coordlid@t', 'coordinator')) v(mail, r)
  join auth.users on email = v.mail;

  for i in 1..8 loop
    insert into public.household (person_name, timezone, support_level, share_quick_notes, org_id)
    values ('P' || i, 'Europe/Brussels',
            niveaus[1 + (i - 1) % 3],
            (i % 2 = 0),
            case when i in (2, 4, 6, 8) then org end)
    returning id into hh;
    insert into t_hh values (i, hh);

    insert into public.membership (household_id, profile_id, role)
    select hh, id, r::public.member_role from (values
      ('p-self@t', 'admin'), ('p-admin@t', 'admin'), ('p-member@t', 'member'),
      ('p-care@t', 'caregiver'), ('p-tablet@t', 'person'), ('p-coordlid@t', 'member')) v(mail, r)
    join auth.users on email = v.mail;

    -- 1–6: de mens is "Dit ben jij"; 7–8: de gekoppelde tablet (zoals pair-device doet)
    insert into public.person_card (household_id, name, relation, kind, profile_id)
    select hh, 'P' || i, 'ikzelf', 'self', id from auth.users
     where email = case when i <= 6 then 'p-self@t' else 'p-tablet@t' end;
  end loop;
end $$;

create function pg_temp.vergelijk(ronde int) returns void language plpgsql as $$
declare
  u record; h record; r record;
  oud boolean; nieuw boolean;
  n int := 0;
begin
  for u in select mail, id from t_user order by 1 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    for h in select nr, id from t_hh order by nr loop
      for r in select perm, expr from legacy_rule order by perm loop
        execute format('select coalesce((%s), false)', replace(r.expr, 'hh', quote_literal(h.id) || '::uuid')) into oud;
        nieuw := public.can_legacy(h.id, r.perm);
        n := n + 1;
        if oud is distinct from nieuw then
          insert into t_mis values (u.mail, h.nr, r.perm, oud, nieuw, ronde);
        end if;
      end loop;
    end loop;
  end loop;
  insert into t_tel values (ronde, n);
end $$;

-- Elke permissie uit 48 heeft een regel, en omgekeerd.
do $$
declare x int;
begin
  select count(*) into x from public.permission p where not exists (select 1 from legacy_rule l where l.perm = p.key);
  if x > 0 then raise exception 'GEZAKT: % permissies zonder regel in legacy_rule', x; end if;
  select count(*) into x from legacy_rule l where not exists (select 1 from public.permission p where p.key = l.perm);
  if x > 0 then raise exception 'GEZAKT: % regels zonder permissie', x; end if;
  raise notice 'ok: elke permissie heeft precies één legacy-regel';
end $$;

-- Ronde 1
set local role authenticated;
select pg_temp.vergelijk(1);
reset role;

-- Ronde 2: alle fasen en deelkeuzes verschuiven; consent moet volgen.
update public.household h
   set support_level = case support_level when 'zelf' then 'samen' when 'samen' then 'ondersteund' else 'zelf' end,
       share_quick_notes = not share_quick_notes
 where h.id in (select id from t_hh);

set local role authenticated;
select pg_temp.vergelijk(2);
reset role;

-- Ronde 3: een organisatie loskoppelen en een andere koppelen.
update public.household set org_id = null where id = (select id from t_hh where nr = 2);
update public.household set org_id = (select id from public.organisation where name = 'Parity WZC')
 where id = (select id from t_hh where nr = 1);

set local role authenticated;
select pg_temp.vergelijk(3);

-- my_access() is precies de lijst van can_legacy()
do $$
declare x int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from t_user where mail = 'p-member@t'), 'role', 'authenticated')::text, true);
  select count(*) into x
    from t_hh h, public.permission p
   where public.can_legacy(h.id, p.key) is distinct from
         (array_position((select m.permissions from public.my_access(h.id) m), p.key) is not null);
  if x > 0 then raise exception 'GEZAKT: my_access wijkt % keer af', x; end if;
  raise notice 'ok: my_access() = can_legacy()';
end $$;

-- Een onbestaande permissie is altijd nee.
do $$
begin
  if public.can_legacy((select id from t_hh where nr = 1), 'bestaat.niet') then
    raise exception 'GEZAKT: onbestaande permissie gaf ja';
  end if;
  raise notice 'ok: onbestaande permissie geeft nee';
end $$;
reset role;

-- anon kan de functies niet aanroepen
set local role anon;
do $$
begin
  begin
    perform public.can_legacy(gen_random_uuid(), 'agenda.read');
  exception when insufficient_privilege then
    raise notice 'ok: anon kan can_legacy niet aanroepen';
    return;
  end;
  raise exception 'GEZAKT: anon kon can_legacy aanroepen';
end $$;
reset role;

-- Uitslag
do $$
declare
  mis int; tot int; rij record;
begin
  select count(*) into mis from t_mis;
  select sum(n) into tot from t_tel;
  if mis > 0 then
    for rij in select * from t_mis order by ronde, perm, wie, hh limit 25 loop
      raise notice 'verschil: ronde % · % · H% · % — oud %, nieuw %',
        rij.ronde, rij.wie, rij.hh, rij.perm, rij.oud, rij.nieuw;
    end loop;
    raise exception 'GEZAKT: % verschillen op % vergelijkingen', mis, tot;
  end if;
  raise notice 'ok: pariteit — % vergelijkingen, 0 verschillen', tot;
end $$;

rollback;
