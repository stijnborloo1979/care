-- =====================================================================
--  LIFEANGLE — policies via can_legacy(), groep 1
--  Supabase migratie, versie 50
--
--  Draai dit na 49_can_legacy.sql.
--  Terugdraaien: supabase/rollback/50_policies_groep1.sql
--  Tests: supabase/tests/test_51_policy_parity.sql
--
--  Wat er gebeurt
--  --------------
--  40 policies op minder gevoelige tabellen (agenda, routines, Wie is wie,
--  weetjes, foto's, radio, boodschappen, taken, meldingen, leden,
--  uitnodigingen, instellingen) vragen voortaan can_legacy() in plaats van
--  auth_role() / is_member() / family_role().
--
--  Wie wat mag, verandert NIET. De policytest draait elke tabel voor 10
--  soorten gebruikers voor en na deze migratie (lezen, toevoegen, wijzigen,
--  wissen) en eist dezelfde uitkomst.
--
--  Een tabel die in jouw project niet bestaat, wordt overgeslagen.
--
--  Rijvoorwaarden die niet over het huishouden gaan (created_by = ik,
--  channel = 'person', target_role) blijven letterlijk staan.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.can_legacy(uuid, text)') is null then
    raise exception 'Draai eerst 49_can_legacy.sql';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  1. Enkele permissies apart benoemen
--
--  Zelfde regel als een bestaande sleutel, maar een andere betekenis.
--  Later (v2) kunnen ze dan los van elkaar strenger worden.
-- ---------------------------------------------------------------------

insert into public.permission (key, description, owner, consent_categories, sensitive_read) values
  ('shopping.delete_any',     'Elk product van de lijst halen',                 'resident', '{}', false),
  ('notification.update',     'Meldingen als gezien markeren',                  'resident', '{}', false),
  ('push.subscribe',          'Meldingen op dit toestel ontvangen',             'resident', '{}', false),
  ('alert_channel.write',     'Eigen meldingskanaal (WhatsApp, ...) instellen', 'resident', '{}', false),
  ('consent.history.read',    'Geschiedenis van toestemmingen lezen',           'resident', '{}', false),
  ('medication_log.write',    'Medicatiemomenten beheren',                      'resident', '{}', false),
  ('medication_history.read', 'Wijzigingen in het medicatieschema lezen',       'resident', '{meekijken}', false),
  ('care_log.update_any',     'Elke logboekregel wijzigen',                     'resident', '{}', false),
  ('message.read_receipts',   'Zien wie een bericht gelezen heeft',             'resident', '{}', false),
  ('files.messages.write',    'Spraakberichten en foto''s uploaden',            'resident', '{}', false),
  ('files.messages.delete',   'Spraakberichten en foto''s wissen',              'resident', '{}', false)
on conflict (key) do nothing;

insert into public.role_permission (stelsel, relation, permission_key, needs_consent)
select 'legacy', r, k, c from (values
  ('shopping.delete_any',     array['admin', 'member', 'org_member'], false),
  ('notification.update',     array['admin', 'member', 'caregiver', 'person', 'org_member'], false),
  ('push.subscribe',          array['admin', 'member', 'caregiver', 'person', 'org_member'], false),
  ('alert_channel.write',     array['admin', 'member', 'org_member'], false),
  ('consent.history.read',    array['self', 'admin'], false),
  ('medication_log.write',    array['admin', 'member', 'org_member'], false),
  ('medication_history.read', array['self', 'person'], false),
  ('medication_history.read', array['admin', 'member', 'caregiver', 'org_member'], true),
  ('care_log.update_any',     array['admin'], false),
  ('message.read_receipts',   array['admin', 'member', 'caregiver', 'person', 'org_member'], false),
  ('files.messages.write',    array['admin', 'member', 'person'], false),
  ('files.messages.delete',   array['admin', 'member'], false)
) v(k, rels, c), unnest(v.rels) r
on conflict (stelsel, relation, permission_key) do nothing;


-- ---------------------------------------------------------------------
--  2. Policies
-- ---------------------------------------------------------------------

do $$ begin
  if to_regclass('public.radio_station') is null then
    raise notice 'overgeslagen: public.radio_station bestaat niet (radio_read)';
  else
    execute $pol$drop policy if exists radio_read on public.radio_station$pol$;
    execute $pol$create policy radio_read on public.radio_station for select
      using (public.can_legacy(household_id, 'radio.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.radio_station') is null then
    raise notice 'overgeslagen: public.radio_station bestaat niet (radio_write)';
  else
    execute $pol$drop policy if exists radio_write on public.radio_station$pol$;
    execute $pol$create policy radio_write on public.radio_station for all
      using (public.can_legacy(household_id, 'radio.write'))
      with check (public.can_legacy(household_id, 'radio.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_read)';
  else
    execute $pol$drop policy if exists shopping_read on public.shopping_item$pol$;
    execute $pol$create policy shopping_read on public.shopping_item for select
      using (public.can_legacy(household_id, 'shopping.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_insert)';
  else
    execute $pol$drop policy if exists shopping_insert on public.shopping_item$pol$;
    execute $pol$create policy shopping_insert on public.shopping_item for insert
      with check (public.can_legacy(household_id, 'shopping.write') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_update)';
  else
    execute $pol$drop policy if exists shopping_update on public.shopping_item$pol$;
    execute $pol$create policy shopping_update on public.shopping_item for update
      using (public.can_legacy(household_id, 'shopping.write'))
      with check (public.can_legacy(household_id, 'shopping.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_delete)';
  else
    execute $pol$drop policy if exists shopping_delete on public.shopping_item$pol$;
    execute $pol$create policy shopping_delete on public.shopping_item for delete
      using (created_by = auth.uid() or public.can_legacy(household_id, 'shopping.delete_any'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.task') is null then
    raise notice 'overgeslagen: public.task bestaat niet (task_family)';
  else
    execute $pol$drop policy if exists task_family on public.task$pol$;
    execute $pol$create policy task_family on public.task for all
      using (public.can_legacy(household_id, 'task.manage'))
      with check (public.can_legacy(household_id, 'task.manage'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.voice_action') is null then
    raise notice 'overgeslagen: public.voice_action bestaat niet (voice_action_read)';
  else
    execute $pol$drop policy if exists voice_action_read on public.voice_action$pol$;
    execute $pol$create policy voice_action_read on public.voice_action for select
      using (public.can_legacy(household_id, 'voice_action.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.call') is null then
    raise notice 'overgeslagen: public.call bestaat niet (call_read)';
  else
    execute $pol$drop policy if exists call_read on public.call$pol$;
    execute $pol$create policy call_read on public.call for select
      using (public.can_legacy(household_id, 'call.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.location_setting') is null then
    raise notice 'overgeslagen: public.location_setting bestaat niet (location_read)';
  else
    execute $pol$drop policy if exists location_read on public.location_setting$pol$;
    execute $pol$create policy location_read on public.location_setting for select
      using (public.can_legacy(household_id, 'location_setting.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.location_setting') is null then
    raise notice 'overgeslagen: public.location_setting bestaat niet (location_write)';
  else
    execute $pol$drop policy if exists location_write on public.location_setting$pol$;
    execute $pol$create policy location_write on public.location_setting for all
      using (public.can_legacy(household_id, 'location_setting.write'))
      with check (public.can_legacy(household_id, 'location_setting.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine') is null then
    raise notice 'overgeslagen: public.routine bestaat niet (routine_read)';
  else
    execute $pol$drop policy if exists routine_read on public.routine$pol$;
    execute $pol$create policy routine_read on public.routine for select
      using (public.can_legacy(household_id, 'routine.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine') is null then
    raise notice 'overgeslagen: public.routine bestaat niet (routine_write)';
  else
    execute $pol$drop policy if exists routine_write on public.routine$pol$;
    execute $pol$create policy routine_write on public.routine for all
      using (public.can_legacy(household_id, 'routine.write'))
      with check (public.can_legacy(household_id, 'routine.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine_step') is null then
    raise notice 'overgeslagen: public.routine_step bestaat niet (routine_step_read)';
  else
    execute $pol$drop policy if exists routine_step_read on public.routine_step$pol$;
    execute $pol$create policy routine_step_read on public.routine_step for select
      using (public.can_legacy(household_id, 'routine.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine_step') is null then
    raise notice 'overgeslagen: public.routine_step bestaat niet (routine_step_write)';
  else
    execute $pol$drop policy if exists routine_step_write on public.routine_step$pol$;
    execute $pol$create policy routine_step_write on public.routine_step for all
      using (public.can_legacy(household_id, 'routine.write'))
      with check (public.can_legacy(household_id, 'routine.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.person_card') is null then
    raise notice 'overgeslagen: public.person_card bestaat niet (person_card_read)';
  else
    execute $pol$drop policy if exists person_card_read on public.person_card$pol$;
    execute $pol$create policy person_card_read on public.person_card for select
      using (public.can_legacy(household_id, 'people.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.person_card') is null then
    raise notice 'overgeslagen: public.person_card bestaat niet (person_card_write)';
  else
    execute $pol$drop policy if exists person_card_write on public.person_card$pol$;
    execute $pol$create policy person_card_write on public.person_card for all
      using (public.can_legacy(household_id, 'people.write'))
      with check (public.can_legacy(household_id, 'people.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_event_read)';
  else
    execute $pol$drop policy if exists agenda_event_read on public.agenda_event$pol$;
    execute $pol$create policy agenda_event_read on public.agenda_event for select
      using (public.can_legacy(household_id, 'agenda.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_event_write)';
  else
    execute $pol$drop policy if exists agenda_event_write on public.agenda_event$pol$;
    execute $pol$create policy agenda_event_write on public.agenda_event for all
      using (public.can_legacy(household_id, 'agenda.write'))
      with check (public.can_legacy(household_id, 'agenda.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_insert)';
  else
    execute $pol$drop policy if exists agenda_caregiver_insert on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_insert on public.agenda_event for insert
      with check (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_update)';
  else
    execute $pol$drop policy if exists agenda_caregiver_update on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_update on public.agenda_event for update
      using (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid())
      with check (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_delete)';
  else
    execute $pol$drop policy if exists agenda_caregiver_delete on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_delete on public.agenda_event for delete
      using (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_note') is null then
    raise notice 'overgeslagen: public.memory_note bestaat niet (memory_note_read)';
  else
    execute $pol$drop policy if exists memory_note_read on public.memory_note$pol$;
    execute $pol$create policy memory_note_read on public.memory_note for select
      using (public.can_legacy(household_id, 'notes.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_note') is null then
    raise notice 'overgeslagen: public.memory_note bestaat niet (memory_note_write)';
  else
    execute $pol$drop policy if exists memory_note_write on public.memory_note$pol$;
    execute $pol$create policy memory_note_write on public.memory_note for all
      using (public.can_legacy(household_id, 'notes.write'))
      with check (public.can_legacy(household_id, 'notes.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_photo') is null then
    raise notice 'overgeslagen: public.memory_photo bestaat niet (memory_photo_read)';
  else
    execute $pol$drop policy if exists memory_photo_read on public.memory_photo$pol$;
    execute $pol$create policy memory_photo_read on public.memory_photo for select
      using (public.can_legacy(household_id, 'memories.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_photo') is null then
    raise notice 'overgeslagen: public.memory_photo bestaat niet (memory_photo_write)';
  else
    execute $pol$drop policy if exists memory_photo_write on public.memory_photo$pol$;
    execute $pol$create policy memory_photo_write on public.memory_photo for all
      using (public.can_legacy(household_id, 'memories.write'))
      with check (public.can_legacy(household_id, 'memories.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification') is null then
    raise notice 'overgeslagen: public.notification bestaat niet (notification_read)';
  else
    execute $pol$drop policy if exists notification_read on public.notification$pol$;
    execute $pol$create policy notification_read on public.notification for select
      using (public.can_legacy(household_id, 'notification.read') and (target_role is null or target_role = public.auth_role(household_id)))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification') is null then
    raise notice 'overgeslagen: public.notification bestaat niet (notification_update)';
  else
    execute $pol$drop policy if exists notification_update on public.notification$pol$;
    execute $pol$create policy notification_update on public.notification for update
      using (public.can_legacy(household_id, 'notification.update'))
      with check (public.can_legacy(household_id, 'notification.update'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification_delivery') is null then
    raise notice 'overgeslagen: public.notification_delivery bestaat niet (delivery_read)';
  else
    execute $pol$drop policy if exists delivery_read on public.notification_delivery$pol$;
    execute $pol$create policy delivery_read on public.notification_delivery for select
      using (exists (select 1 from public.notification n where n.id = notification_delivery.notification_id and public.can_legacy(n.household_id, 'notification_delivery.read')))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.push_subscription') is null then
    raise notice 'overgeslagen: public.push_subscription bestaat niet (push_own)';
  else
    execute $pol$drop policy if exists push_own on public.push_subscription$pol$;
    execute $pol$create policy push_own on public.push_subscription for all
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid() and public.can_legacy(household_id, 'push.subscribe'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.alert_channel') is null then
    raise notice 'overgeslagen: public.alert_channel bestaat niet (alert_channel_self)';
  else
    execute $pol$drop policy if exists alert_channel_self on public.alert_channel$pol$;
    execute $pol$create policy alert_channel_self on public.alert_channel for all
      using (profile_id = auth.uid())
      with check (profile_id = auth.uid() and public.can_legacy(household_id, 'alert_channel.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.device_pairing') is null then
    raise notice 'overgeslagen: public.device_pairing bestaat niet (device_pairing_read)';
  else
    execute $pol$drop policy if exists device_pairing_read on public.device_pairing$pol$;
    execute $pol$create policy device_pairing_read on public.device_pairing for select
      using (public.can_legacy(household_id, 'device.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.consent') is null then
    raise notice 'overgeslagen: public.consent bestaat niet (consent_read)';
  else
    execute $pol$drop policy if exists consent_read on public.consent$pol$;
    execute $pol$create policy consent_read on public.consent for select
      using (public.can_legacy(household_id, 'consent.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.consent_history') is null then
    raise notice 'overgeslagen: public.consent_history bestaat niet (consent_history_read)';
  else
    execute $pol$drop policy if exists consent_history_read on public.consent_history$pol$;
    execute $pol$create policy consent_history_read on public.consent_history for select
      using (public.can_legacy(household_id, 'consent.history.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.household') is null then
    raise notice 'overgeslagen: public.household bestaat niet (household_read)';
  else
    execute $pol$drop policy if exists household_read on public.household$pol$;
    execute $pol$create policy household_read on public.household for select
      using (public.can_legacy(id, 'household.read'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.household') is null then
    raise notice 'overgeslagen: public.household bestaat niet (household_write)';
  else
    execute $pol$drop policy if exists household_write on public.household$pol$;
    execute $pol$create policy household_write on public.household for update
      using (public.can_legacy(id, 'household.write'))
      with check (public.can_legacy(id, 'household.write'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.membership') is null then
    raise notice 'overgeslagen: public.membership bestaat niet (membership_read)';
  else
    execute $pol$drop policy if exists membership_read on public.membership$pol$;
    execute $pol$create policy membership_read on public.membership for select
      using (public.can_legacy(household_id, 'membership.read') or profile_id = auth.uid())$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.membership') is null then
    raise notice 'overgeslagen: public.membership bestaat niet (membership_admin)';
  else
    execute $pol$drop policy if exists membership_admin on public.membership$pol$;
    execute $pol$create policy membership_admin on public.membership for all
      using (public.can_legacy(household_id, 'membership.manage'))
      with check (public.can_legacy(household_id, 'membership.manage'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.invitation') is null then
    raise notice 'overgeslagen: public.invitation bestaat niet (invitation_admin)';
  else
    execute $pol$drop policy if exists invitation_admin on public.invitation$pol$;
    execute $pol$create policy invitation_admin on public.invitation for select
      using (public.can_legacy(household_id, 'invitation.manage'))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.invitation') is null then
    raise notice 'overgeslagen: public.invitation bestaat niet (invitation_revoke)';
  else
    execute $pol$drop policy if exists invitation_revoke on public.invitation$pol$;
    execute $pol$create policy invitation_revoke on public.invitation for update
      using (public.can_legacy(household_id, 'invitation.manage'))
      with check (public.can_legacy(household_id, 'invitation.manage'))$pol$;
  end if;
end $$;

