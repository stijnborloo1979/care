-- Terugdraaien van 50_policies_groep1.sql: de policies van vóór 50,
-- letterlijk zoals Postgres ze bewaarde. Draai eerst de rollback van 51.

do $$ begin
  if to_regclass('public.radio_station') is null then
    raise notice 'overgeslagen: public.radio_station bestaat niet (radio_read)';
  else
    execute $pol$drop policy if exists radio_read on public.radio_station$pol$;
    execute $pol$create policy radio_read on public.radio_station for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.radio_station') is null then
    raise notice 'overgeslagen: public.radio_station bestaat niet (radio_write)';
  else
    execute $pol$drop policy if exists radio_write on public.radio_station$pol$;
    execute $pol$create policy radio_write on public.radio_station for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_read)';
  else
    execute $pol$drop policy if exists shopping_read on public.shopping_item$pol$;
    execute $pol$create policy shopping_read on public.shopping_item for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_insert)';
  else
    execute $pol$drop policy if exists shopping_insert on public.shopping_item$pol$;
    execute $pol$create policy shopping_insert on public.shopping_item for insert
      with check (((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])) AND (created_by = auth.uid())))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_update)';
  else
    execute $pol$drop policy if exists shopping_update on public.shopping_item$pol$;
    execute $pol$create policy shopping_update on public.shopping_item for update
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role, 'person'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.shopping_item') is null then
    raise notice 'overgeslagen: public.shopping_item bestaat niet (shopping_delete)';
  else
    execute $pol$drop policy if exists shopping_delete on public.shopping_item$pol$;
    execute $pol$create policy shopping_delete on public.shopping_item for delete
      using (((created_by = auth.uid()) OR (auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.task') is null then
    raise notice 'overgeslagen: public.task bestaat niet (task_family)';
  else
    execute $pol$drop policy if exists task_family on public.task$pol$;
    execute $pol$create policy task_family on public.task for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.voice_action') is null then
    raise notice 'overgeslagen: public.voice_action bestaat niet (voice_action_read)';
  else
    execute $pol$drop policy if exists voice_action_read on public.voice_action$pol$;
    execute $pol$create policy voice_action_read on public.voice_action for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.call') is null then
    raise notice 'overgeslagen: public.call bestaat niet (call_read)';
  else
    execute $pol$drop policy if exists call_read on public.call$pol$;
    execute $pol$create policy call_read on public.call for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.location_setting') is null then
    raise notice 'overgeslagen: public.location_setting bestaat niet (location_read)';
  else
    execute $pol$drop policy if exists location_read on public.location_setting$pol$;
    execute $pol$create policy location_read on public.location_setting for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.location_setting') is null then
    raise notice 'overgeslagen: public.location_setting bestaat niet (location_write)';
  else
    execute $pol$drop policy if exists location_write on public.location_setting$pol$;
    execute $pol$create policy location_write on public.location_setting for all
      using ((auth_role(household_id) = 'admin'::member_role))
      with check ((auth_role(household_id) = 'admin'::member_role))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine') is null then
    raise notice 'overgeslagen: public.routine bestaat niet (routine_read)';
  else
    execute $pol$drop policy if exists routine_read on public.routine$pol$;
    execute $pol$create policy routine_read on public.routine for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine') is null then
    raise notice 'overgeslagen: public.routine bestaat niet (routine_write)';
  else
    execute $pol$drop policy if exists routine_write on public.routine$pol$;
    execute $pol$create policy routine_write on public.routine for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine_step') is null then
    raise notice 'overgeslagen: public.routine_step bestaat niet (routine_step_read)';
  else
    execute $pol$drop policy if exists routine_step_read on public.routine_step$pol$;
    execute $pol$create policy routine_step_read on public.routine_step for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.routine_step') is null then
    raise notice 'overgeslagen: public.routine_step bestaat niet (routine_step_write)';
  else
    execute $pol$drop policy if exists routine_step_write on public.routine_step$pol$;
    execute $pol$create policy routine_step_write on public.routine_step for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.person_card') is null then
    raise notice 'overgeslagen: public.person_card bestaat niet (person_card_read)';
  else
    execute $pol$drop policy if exists person_card_read on public.person_card$pol$;
    execute $pol$create policy person_card_read on public.person_card for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.person_card') is null then
    raise notice 'overgeslagen: public.person_card bestaat niet (person_card_write)';
  else
    execute $pol$drop policy if exists person_card_write on public.person_card$pol$;
    execute $pol$create policy person_card_write on public.person_card for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_event_read)';
  else
    execute $pol$drop policy if exists agenda_event_read on public.agenda_event$pol$;
    execute $pol$create policy agenda_event_read on public.agenda_event for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_event_write)';
  else
    execute $pol$drop policy if exists agenda_event_write on public.agenda_event$pol$;
    execute $pol$create policy agenda_event_write on public.agenda_event for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_insert)';
  else
    execute $pol$drop policy if exists agenda_caregiver_insert on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_insert on public.agenda_event for insert
      with check (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_update)';
  else
    execute $pol$drop policy if exists agenda_caregiver_update on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_update on public.agenda_event for update
      using (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())))
      with check (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.agenda_event') is null then
    raise notice 'overgeslagen: public.agenda_event bestaat niet (agenda_caregiver_delete)';
  else
    execute $pol$drop policy if exists agenda_caregiver_delete on public.agenda_event$pol$;
    execute $pol$create policy agenda_caregiver_delete on public.agenda_event for delete
      using (((auth_role(household_id) = 'caregiver'::member_role) AND (created_by = auth.uid())))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_note') is null then
    raise notice 'overgeslagen: public.memory_note bestaat niet (memory_note_read)';
  else
    execute $pol$drop policy if exists memory_note_read on public.memory_note$pol$;
    execute $pol$create policy memory_note_read on public.memory_note for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_note') is null then
    raise notice 'overgeslagen: public.memory_note bestaat niet (memory_note_write)';
  else
    execute $pol$drop policy if exists memory_note_write on public.memory_note$pol$;
    execute $pol$create policy memory_note_write on public.memory_note for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_photo') is null then
    raise notice 'overgeslagen: public.memory_photo bestaat niet (memory_photo_read)';
  else
    execute $pol$drop policy if exists memory_photo_read on public.memory_photo$pol$;
    execute $pol$create policy memory_photo_read on public.memory_photo for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.memory_photo') is null then
    raise notice 'overgeslagen: public.memory_photo bestaat niet (memory_photo_write)';
  else
    execute $pol$drop policy if exists memory_photo_write on public.memory_photo$pol$;
    execute $pol$create policy memory_photo_write on public.memory_photo for all
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
      with check ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification') is null then
    raise notice 'overgeslagen: public.notification bestaat niet (notification_read)';
  else
    execute $pol$drop policy if exists notification_read on public.notification$pol$;
    execute $pol$create policy notification_read on public.notification for select
      using ((is_member(household_id) AND ((target_role IS NULL) OR (target_role = auth_role(household_id)))))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification') is null then
    raise notice 'overgeslagen: public.notification bestaat niet (notification_update)';
  else
    execute $pol$drop policy if exists notification_update on public.notification$pol$;
    execute $pol$create policy notification_update on public.notification for update
      using (is_member(household_id))
      with check (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.notification_delivery') is null then
    raise notice 'overgeslagen: public.notification_delivery bestaat niet (delivery_read)';
  else
    execute $pol$drop policy if exists delivery_read on public.notification_delivery$pol$;
    execute $pol$create policy delivery_read on public.notification_delivery for select
      using ((EXISTS ( SELECT 1
   FROM notification n
  WHERE ((n.id = notification_delivery.notification_id) AND (auth_role(n.household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))))))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.push_subscription') is null then
    raise notice 'overgeslagen: public.push_subscription bestaat niet (push_own)';
  else
    execute $pol$drop policy if exists push_own on public.push_subscription$pol$;
    execute $pol$create policy push_own on public.push_subscription for all
      using ((profile_id = auth.uid()))
      with check (((profile_id = auth.uid()) AND is_member(household_id)))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.alert_channel') is null then
    raise notice 'overgeslagen: public.alert_channel bestaat niet (alert_channel_self)';
  else
    execute $pol$drop policy if exists alert_channel_self on public.alert_channel$pol$;
    execute $pol$create policy alert_channel_self on public.alert_channel for all
      using ((profile_id = auth.uid()))
      with check (((profile_id = auth.uid()) AND (auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role]))))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.device_pairing') is null then
    raise notice 'overgeslagen: public.device_pairing bestaat niet (device_pairing_read)';
  else
    execute $pol$drop policy if exists device_pairing_read on public.device_pairing$pol$;
    execute $pol$create policy device_pairing_read on public.device_pairing for select
      using ((auth_role(household_id) = ANY (ARRAY['admin'::member_role, 'member'::member_role])))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.consent') is null then
    raise notice 'overgeslagen: public.consent bestaat niet (consent_read)';
  else
    execute $pol$drop policy if exists consent_read on public.consent$pol$;
    execute $pol$create policy consent_read on public.consent for select
      using (is_member(household_id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.consent_history') is null then
    raise notice 'overgeslagen: public.consent_history bestaat niet (consent_history_read)';
  else
    execute $pol$drop policy if exists consent_history_read on public.consent_history$pol$;
    execute $pol$create policy consent_history_read on public.consent_history for select
      using ((is_self(household_id) OR (family_role(household_id) = 'admin'::member_role)))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.household') is null then
    raise notice 'overgeslagen: public.household bestaat niet (household_read)';
  else
    execute $pol$drop policy if exists household_read on public.household$pol$;
    execute $pol$create policy household_read on public.household for select
      using (is_member(id))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.household') is null then
    raise notice 'overgeslagen: public.household bestaat niet (household_write)';
  else
    execute $pol$drop policy if exists household_write on public.household$pol$;
    execute $pol$create policy household_write on public.household for update
      using ((auth_role(id) = 'admin'::member_role))
      with check ((auth_role(id) = 'admin'::member_role))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.membership') is null then
    raise notice 'overgeslagen: public.membership bestaat niet (membership_read)';
  else
    execute $pol$drop policy if exists membership_read on public.membership$pol$;
    execute $pol$create policy membership_read on public.membership for select
      using ((is_member(household_id) OR (profile_id = auth.uid())))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.membership') is null then
    raise notice 'overgeslagen: public.membership bestaat niet (membership_admin)';
  else
    execute $pol$drop policy if exists membership_admin on public.membership$pol$;
    execute $pol$create policy membership_admin on public.membership for all
      using ((auth_role(household_id) = 'admin'::member_role))
      with check ((auth_role(household_id) = 'admin'::member_role))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.invitation') is null then
    raise notice 'overgeslagen: public.invitation bestaat niet (invitation_admin)';
  else
    execute $pol$drop policy if exists invitation_admin on public.invitation$pol$;
    execute $pol$create policy invitation_admin on public.invitation for select
      using ((family_role(household_id) = 'admin'::member_role))$pol$;
  end if;
end $$;

do $$ begin
  if to_regclass('public.invitation') is null then
    raise notice 'overgeslagen: public.invitation bestaat niet (invitation_revoke)';
  else
    execute $pol$drop policy if exists invitation_revoke on public.invitation$pol$;
    execute $pol$create policy invitation_revoke on public.invitation for update
      using ((family_role(household_id) = 'admin'::member_role))
      with check ((family_role(household_id) = 'admin'::member_role))$pol$;
  end if;
end $$;


delete from public.permission where key in ('shopping.delete_any','notification.update','push.subscribe','alert_channel.write','consent.history.read','medication_log.write','medication_history.read','care_log.update_any','message.read_receipts','files.messages.write','files.messages.delete');
