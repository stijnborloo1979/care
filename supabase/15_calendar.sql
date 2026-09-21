-- =====================================================================
--  THUIS — kalender
--  Supabase migratie, versie 15
--
--  Draai dit na 01_schema.sql.
--
--  Familie kon al plannen. Zorgverleners niet: de agenda was schrijfbaar
--  voor beheerder en familie alleen. Een thuisverpleegkundige die haar
--  eigen bezoek wil inplannen, of een huisarts wiens afspraak verschuift,
--  moest dat telkens via iemand anders laten doen.
--
--  Zorgverleners mogen nu zelf afspraken toevoegen, en hun eigen afspraken
--  wijzigen of wissen. Wat familie of de persoon plande, blijft van hen.
-- =====================================================================

-- Wie plande dit? Dat staat voortaan vanzelf ingevuld.
alter table public.agenda_event alter column created_by set default auth.uid();

drop policy if exists agenda_caregiver_insert on public.agenda_event;
create policy agenda_caregiver_insert on public.agenda_event for insert
  with check (
    public.auth_role(household_id) = 'caregiver'
    and created_by = auth.uid()
  );

drop policy if exists agenda_caregiver_update on public.agenda_event;
create policy agenda_caregiver_update on public.agenda_event for update
  using (public.auth_role(household_id) = 'caregiver' and created_by = auth.uid())
  with check (public.auth_role(household_id) = 'caregiver' and created_by = auth.uid());

drop policy if exists agenda_caregiver_delete on public.agenda_event;
create policy agenda_caregiver_delete on public.agenda_event for delete
  using (public.auth_role(household_id) = 'caregiver' and created_by = auth.uid());
