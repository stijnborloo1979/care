-- Terugdraaien van 50_policies_groep1.sql: de policies van vóór 50,
-- letterlijk zoals Postgres ze bewaarde. Draai eerst de rollback van 51.

drop policy if exists radio_read on public.radio_station;
create policy radio_read on public.radio_station for select
  using (is_member(household_id));

drop policy if exists radio_write on public.radio_station;
create policy radio_write on public.radio_station for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists shopping_read on public.shopping_item;
create policy shopping_read on public.shopping_item for select
  using (is_member(household_id));

drop policy if exists shopping_insert on public.shopping_item;
create policy shopping_insert on public.shopping_item for insert
  with check (((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])) AND (created_by = auth.uid())));

drop policy if exists shopping_update on public.shopping_item;
create policy shopping_update on public.shopping_item for update
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])));

drop policy if exists shopping_delete on public.shopping_item;
create policy shopping_delete on public.shopping_item for delete
  using (((created_by = auth.uid()) OR (auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))));

drop policy if exists task_family on public.task;
create policy task_family on public.task for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists voice_action_read on public.voice_action;
create policy voice_action_read on public.voice_action for select
  using (is_member(household_id));

drop policy if exists call_read on public.call;
create policy call_read on public.call for select
  using (is_member(household_id));

drop policy if exists location_read on public.location_setting;
create policy location_read on public.location_setting for select
  using (is_member(household_id));

drop policy if exists location_write on public.location_setting;
create policy location_write on public.location_setting for all
  using ((auth_role(household_id) = 'admin'::member_role))
  with check ((auth_role(household_id) = 'admin'::member_role));

drop policy if exists routine_read on public.routine;
create policy routine_read on public.routine for select
  using (is_member(household_id));

drop policy if exists routine_write on public.routine;
create policy routine_write on public.routine for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists routine_step_read on public.routine_step;
create policy routine_step_read on public.routine_step for select
  using (is_member(household_id));

drop policy if exists routine_step_write on public.routine_step;
create policy routine_step_write on public.routine_step for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists person_card_read on public.person_card;
create policy person_card_read on public.person_card for select
  using (is_member(household_id));

drop policy if exists person_card_write on public.person_card;
create policy person_card_write on public.person_card for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists agenda_event_read on public.agenda_event;
create policy agenda_event_read on public.agenda_event for select
  using (is_member(household_id));

drop policy if exists agenda_event_write on public.agenda_event;
create policy agenda_event_write on public.agenda_event for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists agenda_caregiver_insert on public.agenda_event;
create policy agenda_caregiver_insert on public.agenda_event for insert
  with check (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())));

drop policy if exists agenda_caregiver_update on public.agenda_event;
create policy agenda_caregiver_update on public.agenda_event for update
  using (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())))
  with check (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())));

drop policy if exists agenda_caregiver_delete on public.agenda_event;
create policy agenda_caregiver_delete on public.agenda_event for delete
  using (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())));

drop policy if exists memory_note_read on public.memory_note;
create policy memory_note_read on public.memory_note for select
  using (is_member(household_id));

drop policy if exists memory_note_write on public.memory_note;
create policy memory_note_write on public.memory_note for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists memory_photo_read on public.memory_photo;
create policy memory_photo_read on public.memory_photo for select
  using (is_member(household_id));

drop policy if exists memory_photo_write on public.memory_photo;
create policy memory_photo_write on public.memory_photo for all
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists notification_read on public.notification;
create policy notification_read on public.notification for select
  using ((is_member(household_id) AND ((target_role IS NULL) OR (target_role = auth_role(household_id)))));

drop policy if exists notification_update on public.notification;
create policy notification_update on public.notification for update
  using (is_member(household_id))
  with check (is_member(household_id));

drop policy if exists delivery_read on public.notification_delivery;
create policy delivery_read on public.notification_delivery for select
  using ((EXISTS ( SELECT 1
   FROM notification n
  WHERE ((n.id = notification_delivery.notification_id) AND (auth_role(n.household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))))));

drop policy if exists push_own on public.push_subscription;
create policy push_own on public.push_subscription for all
  using ((profile_id = auth.uid()))
  with check (((profile_id = auth.uid()) AND is_member(household_id)));

drop policy if exists alert_channel_self on public.alert_channel;
create policy alert_channel_self on public.alert_channel for all
  using ((profile_id = auth.uid()))
  with check (((profile_id = auth.uid()) AND (auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))));

drop policy if exists device_pairing_read on public.device_pairing;
create policy device_pairing_read on public.device_pairing for select
  using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])));

drop policy if exists consent_read on public.consent;
create policy consent_read on public.consent for select
  using (is_member(household_id));

drop policy if exists consent_history_read on public.consent_history;
create policy consent_history_read on public.consent_history for select
  using ((is_self(household_id) OR (family_role(household_id) = 'admin'::member_role)));

drop policy if exists household_read on public.household;
create policy household_read on public.household for select
  using (is_member(id));

drop policy if exists household_write on public.household;
create policy household_write on public.household for update
  using ((auth_role(id) = 'admin'::member_role))
  with check ((auth_role(id) = 'admin'::member_role));

drop policy if exists membership_read on public.membership;
create policy membership_read on public.membership for select
  using ((is_member(household_id) OR (profile_id = auth.uid())));

drop policy if exists membership_admin on public.membership;
create policy membership_admin on public.membership for all
  using ((auth_role(household_id) = 'admin'::member_role))
  with check ((auth_role(household_id) = 'admin'::member_role));

drop policy if exists invitation_admin on public.invitation;
create policy invitation_admin on public.invitation for select
  using ((family_role(household_id) = 'admin'::member_role));

drop policy if exists invitation_revoke on public.invitation;
create policy invitation_revoke on public.invitation for update
  using ((family_role(household_id) = 'admin'::member_role))
  with check ((family_role(household_id) = 'admin'::member_role));

delete from public.permission where key in ('shopping.delete_any','notification.update','push.subscribe','alert_channel.write','consent.history.read','medication_log.write','medication_history.read','care_log.update_any','message.read_receipts','files.messages.write','files.messages.delete');
