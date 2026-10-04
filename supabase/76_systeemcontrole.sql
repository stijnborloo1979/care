-- =====================================================================
--  LIFEANGLE — welke migraties staan er in deze database?
--  Supabase migratie, versie 76
--
--  Draai dit na 75_bezoekfotos.sql. Kan ook vroeger: het kijkt alleen.
--  Terugdraaien: supabase/rollback/76_systeemcontrole.sql
--  Tests: supabase/tests/test_76_systeemcontrole.sql
--
--  BESTAAND   welke migraties gedraaid zijn, stond nergens. Een vergeten
--             migratie (bv. 25 of 44) gaf in de app een fout 400 zonder
--             uitleg.
--  VOORGESTELD systeem_controle(): per migratie één kenmerk (een tabel, een
--             kolom of een functie) en of het er is. De app toont de
--             beheerder wat ontbreekt. Alleen namen uit de catalogus, nooit
--             gegevens.
--  RISICO     geen: leest alleen de catalogus.
-- =====================================================================

create or replace function public.systeem_controle()
returns table (migratie integer, onderdeel text, aanwezig boolean)
language sql
stable
security definer
set search_path = public
as $$
  with k(nr, soort, object, label) as (values
    (1, 'tabel', 'household', 'Basis'),
    (3, 'tabel', 'organisation', 'Organisaties'),
    (4, 'tabel', 'message', 'Berichten'),
    (5, 'tabel', 'invitation', 'Uitnodigingen'),
    (6, 'kolom', 'agenda_event.routine_step_id', 'Nachtelijke dagplanning'),
    (7, 'kolom', 'household.display_prefs', 'Weergave'),
    (8, 'tabel', 'location_point', 'Locatie'),
    (9, 'functie', 'pending_embeddings', 'AI-zoeken'),
    (11, 'tabel', 'call', 'Bellen'),
    (12, 'tabel', 'device_pairing', 'Tablet koppelen'),
    (13, 'tabel', 'quick_note', 'Onthoud dit'),
    (14, 'kolom', 'household.support_level', 'Hoeveel hulp'),
    (16, 'tabel', 'life_story', 'Verhalen'),
    (17, 'tabel', 'radio_station', 'Radio'),
    (18, 'functie', 'sync_medication_today', 'Medicatie'),
    (20, 'tabel', 'push_subscription', 'Pushmeldingen'),
    (21, 'tabel', 'task', 'Taken'),
    (22, 'functie', 'set_support_level', 'Hulp door familie'),
    (23, 'kolom', 'room.photo_path', 'Foto van een kamer'),
    (25, 'tabel', 'medication_change', 'Medicatiegeschiedenis'),
    (26, 'kolom', 'household.report_prefs', 'Analyse'),
    (27, 'kolom', 'household.home_layout', 'Indeling'),
    (29, 'functie', 'hide_message', 'Bericht weghalen'),
    (30, 'functie', 'vraag_gesprek', 'Terugbellen'),
    (31, 'kolom', 'household.profiel', 'Dit ben ik'),
    (32, 'functie', 'dag_klaarzetten', 'Dag klaarzetten'),
    (33, 'functie', 'vraag_hulp', 'Hulp vragen'),
    (34, 'functie', 'push_status', 'Push nakijken'),
    (35, 'kolom', 'notification.mailed_at', 'Mail'),
    (36, 'tabel', 'alert_channel', 'Kanalen'),
    (38, 'functie', 'med_log_gewijzigd', 'Medicatie afvinken'),
    (39, 'kolom', 'notification.herhalingen', 'Nogmaals vragen'),
    (40, 'functie', 'med_doses_bij', 'Medicatie ongedaan'),
    (41, 'kolom', 'agenda_event.med_moment', 'Medicatie in de agenda'),
    (43, 'kolom', 'notification.betreft', 'Wie het vroeg'),
    (44, 'kolom', 'agenda_event.claimed_by', 'Wie gaat er langs'),
    (45, 'kolom', 'household.woont_bij', 'Gedeeld huis'),
    (46, 'tabel', 'voice_action', 'LifeAngle Voice'),
    (47, 'functie', 'mag_opname_horen', 'Beveiliging 47'),
    (48, 'tabel', 'permission', 'Permissies'),
    (49, 'functie', 'can_legacy', 'Permissies in de database'),
    (52, 'tabel', 'department', 'Verblijven'),
    (53, 'functie', 'org_bewoners', 'Organisatie zonder inhoud'),
    (54, 'tabel', 'emergency_access', 'Noodtoegang'),
    (55, 'functie', 'audit_inzage', 'Leesaudit'),
    (56, 'kolom', 'life_story.audio_bucket', 'Dagboekopslag'),
    (58, 'tabel', 'entitlement', 'Abonnementen'),
    (59, 'tabel', 'care_note', 'LifeAngle Care'),
    (60, 'tabel', 'org_invitation', 'Personeel'),
    (61, 'kolom', 'organisation.bewaartermijn_maanden', 'Bewaartermijn'),
    (62, 'kolom', 'organisation.overdracht_bewaar_dagen', 'Overdracht bewaren'),
    (63, 'tabel', 'team_message', 'Teamberichten'),
    (65, 'tabel', 'koppel_poging', 'Herstellingen 65'),
    (67, 'functie', 'mijn_org_uitnodigingen', 'Uitnodigingen in de app'),
    (68, 'tabel', 'resident_message', 'Vragen aan het zorgteam'),
    (70, 'functie', 'medewerker_gevolg', 'Medewerkers beheren'),
    (71, 'kolom', 'stay.end_reason', 'Verblijf beëindigen'),
    (72, 'kolom', 'department.archived_at', 'Afdelingen'),
    (73, 'functie', 'zelfkaart_controle', 'Zelfkaart'),
    (74, 'tabel', 'visit_log', 'Bezoekboek'),
    (75, 'functie', 'mag_bezoekfoto_plaatsen', 'Bezoekfoto''s'),
    (76, 'functie', 'systeem_controle', 'Systeemcontrole'),
    (77, 'functie', 'publieke_prijzen', 'Prijzen'),
    (78, 'functie', 'dag_van_bewoner', 'Dag van de afdeling'),
    (79, 'functie', 'nieuws_voor', 'Nieuws van het WZC'),
    (80, 'functie', 'uitstap_stap', 'Uitstap'),
    (81, 'functie', 'kwijt_op_afdeling', 'Spullen van de bewoner'),
    (82, 'functie', 'bezetting', 'Kamers en bezetting'),
    (83, 'functie', 'org_rapport', 'Rapporten')
  )
  select k.nr, k.label,
    case k.soort
      when 'tabel' then to_regclass('public.' || k.object) is not null
      when 'kolom' then exists (
        select 1 from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = split_part(k.object, '.', 1)
           and c.column_name = split_part(k.object, '.', 2))
      when 'functie' then exists (
        select 1 from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = k.object)
    end
  from k
  order by k.nr;
$$;

revoke execute on function public.systeem_controle() from public, anon;
grant execute on function public.systeem_controle() to authenticated, service_role;
