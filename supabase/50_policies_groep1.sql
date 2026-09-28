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

drop policy if exists radio_read on public.radio_station;
create policy radio_read on public.radio_station for select
  using (public.can_legacy(household_id, 'radio.read'));

drop policy if exists radio_write on public.radio_station;
create policy radio_write on public.radio_station for all
  using (public.can_legacy(household_id, 'radio.write'))
  with check (public.can_legacy(household_id, 'radio.write'));

drop policy if exists shopping_read on public.shopping_item;
create policy shopping_read on public.shopping_item for select
  using (public.can_legacy(household_id, 'shopping.read'));

drop policy if exists shopping_insert on public.shopping_item;
create policy shopping_insert on public.shopping_item for insert
  with check (public.can_legacy(household_id, 'shopping.write') and created_by = auth.uid());

drop policy if exists shopping_update on public.shopping_item;
create policy shopping_update on public.shopping_item for update
  using (public.can_legacy(household_id, 'shopping.write'))
  with check (public.can_legacy(household_id, 'shopping.write'));

drop policy if exists shopping_delete on public.shopping_item;
create policy shopping_delete on public.shopping_item for delete
  using (created_by = auth.uid() or public.can_legacy(household_id, 'shopping.delete_any'));

drop policy if exists task_family on public.task;
create policy task_family on public.task for all
  using (public.can_legacy(household_id, 'task.manage'))
  with check (public.can_legacy(household_id, 'task.manage'));

drop policy if exists voice_action_read on public.voice_action;
create policy voice_action_read on public.voice_action for select
  using (public.can_legacy(household_id, 'voice_action.read'));

drop policy if exists call_read on public.call;
create policy call_read on public.call for select
  using (public.can_legacy(household_id, 'call.read'));

drop policy if exists location_read on public.location_setting;
create policy location_read on public.location_setting for select
  using (public.can_legacy(household_id, 'location_setting.read'));

drop policy if exists location_write on public.location_setting;
create policy location_write on public.location_setting for all
  using (public.can_legacy(household_id, 'location_setting.write'))
  with check (public.can_legacy(household_id, 'location_setting.write'));

drop policy if exists routine_read on public.routine;
create policy routine_read on public.routine for select
  using (public.can_legacy(household_id, 'routine.read'));

drop policy if exists routine_write on public.routine;
create policy routine_write on public.routine for all
  using (public.can_legacy(household_id, 'routine.write'))
  with check (public.can_legacy(household_id, 'routine.write'));

drop policy if exists routine_step_read on public.routine_step;
create policy routine_step_read on public.routine_step for select
  using (public.can_legacy(household_id, 'routine.read'));

drop policy if exists routine_step_write on public.routine_step;
create policy routine_step_write on public.routine_step for all
  using (public.can_legacy(household_id, 'routine.write'))
  with check (public.can_legacy(household_id, 'routine.write'));

drop policy if exists person_card_read on public.person_card;
create policy person_card_read on public.person_card for select
  using (public.can_legacy(household_id, 'people.read'));

drop policy if exists person_card_write on public.person_card;
create policy person_card_write on public.person_card for all
  using (public.can_legacy(household_id, 'people.write'))
  with check (public.can_legacy(household_id, 'people.write'));

drop policy if exists agenda_event_read on public.agenda_event;
create policy agenda_event_read on public.agenda_event for select
  using (public.can_legacy(household_id, 'agenda.read'));

drop policy if exists agenda_event_write on public.agenda_event;
create policy agenda_event_write on public.agenda_event for all
  using (public.can_legacy(household_id, 'agenda.write'))
  with check (public.can_legacy(household_id, 'agenda.write'));

drop policy if exists agenda_caregiver_insert on public.agenda_event;
create policy agenda_caregiver_insert on public.agenda_event for insert
  with check (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid());

drop policy if exists agenda_caregiver_update on public.agenda_event;
create policy agenda_caregiver_update on public.agenda_event for update
  using (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid())
  with check (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid());

drop policy if exists agenda_caregiver_delete on public.agenda_event;
create policy agenda_caregiver_delete on public.agenda_event for delete
  using (public.can_legacy(household_id, 'agenda.write_own') and created_by = auth.uid());

drop policy if exists memory_note_read on public.memory_note;
create policy memory_note_read on public.memory_note for select
  using (public.can_legacy(household_id, 'notes.read'));

drop policy if exists memory_note_write on public.memory_note;
create policy memory_note_write on public.memory_note for all
  using (public.can_legacy(household_id, 'notes.write'))
  with check (public.can_legacy(household_id, 'notes.write'));

drop policy if exists memory_photo_read on public.memory_photo;
create policy memory_photo_read on public.memory_photo for select
  using (public.can_legacy(household_id, 'memories.read'));

drop policy if exists memory_photo_write on public.memory_photo;
create policy memory_photo_write on public.memory_photo for all
  using (public.can_legacy(household_id, 'memories.write'))
  with check (public.can_legacy(household_id, 'memories.write'));

drop policy if exists notification_read on public.notification;
create policy notification_read on public.notification for select
  using (public.can_legacy(household_id, 'notification.read') and (target_role is null or target_role = public.auth_role(household_id)));

drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification for update
  using (public.can_legacy(household_id, 'notification.update'))
  with check (public.can_legacy(household_id, 'notification.update'));

drop policy if exists delivery_read on public.notification_delivery;
create policy delivery_read on public.notification_delivery for select
  using (exists (select 1 from public.notification n where n.id = notification_delivery.notification_id and public.can_legacy(n.household_id, 'notification_delivery.read')));

drop policy if exists push_own on public.push_subscription;
create policy push_own on public.push_subscription for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.can_legacy(household_id, 'push.subscribe'));

drop policy if exists alert_channel_self on public.alert_channel;
create policy alert_channel_self on public.alert_channel for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.can_legacy(household_id, 'alert_channel.write'));

drop policy if exists device_pairing_read on public.device_pairing;
create policy device_pairing_read on public.device_pairing for select
  using (public.can_legacy(household_id, 'device.read'));

drop policy if exists consent_read on public.consent;
create policy consent_read on public.consent for select
  using (public.can_legacy(household_id, 'consent.read'));

drop policy if exists consent_history_read on public.consent_history;
create policy consent_history_read on public.consent_history for select
  using (public.can_legacy(household_id, 'consent.history.read'));

drop policy if exists household_read on public.household;
create policy household_read on public.household for select
  using (public.can_legacy(id, 'household.read'));

drop policy if exists household_write on public.household;
create policy household_write on public.household for update
  using (public.can_legacy(id, 'household.write'))
  with check (public.can_legacy(id, 'household.write'));

drop policy if exists membership_read on public.membership;
create policy membership_read on public.membership for select
  using (public.can_legacy(household_id, 'membership.read') or profile_id = auth.uid());

drop policy if exists membership_admin on public.membership;
create policy membership_admin on public.membership for all
  using (public.can_legacy(household_id, 'membership.manage'))
  with check (public.can_legacy(household_id, 'membership.manage'));

drop policy if exists invitation_admin on public.invitation;
create policy invitation_admin on public.invitation for select
  using (public.can_legacy(household_id, 'invitation.manage'));

drop policy if exists invitation_revoke on public.invitation;
create policy invitation_revoke on public.invitation for update
  using (public.can_legacy(household_id, 'invitation.manage'))
  with check (public.can_legacy(household_id, 'invitation.manage'));

