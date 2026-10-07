-- =====================================================================
--  LIFEANGLE — geplande taken die je met de hand inplant
--
--  Geen migratie. Draai dit één keer in de SQL-editor van Supabase,
--  na alle migraties. Opnieuw draaien mag: elke taak wordt eerst
--  weggehaald en dan opnieuw ingepland.
--
--  Waarom niet in een migratie? Twee van deze taken roepen een edge
--  function aan met de service role key, en een sleutel hoort niet in een
--  bestand in de repo. Je vult hem hieronder in, in de SQL-editor, en
--  bewaart dit bestand daarna niet met de sleutel erin.
--
--  Vooraf, in Dashboard -> Database -> Extensions:
--    - pg_cron  (nodig voor alles)
--    - pg_net   (nodig voor push-notify, cleanup-storage en embed)
--
--  De nachtjob (06) en de opruimtaken (61, 62, 63, 68, 79, 80) plannen
--  zichzelf in bij hun migratie, maar alleen als pg_cron toen al aan
--  stond. Stond het uit, dan draaien ze nooit, zonder foutmelding. Dit
--  script plant ze daarom zekerheidshalve opnieuw in, met dezelfde naam
--  en hetzelfde uur: er komt niets dubbel.
-- =====================================================================

do $$
declare
  -- ▼▼▼ VUL DIT IN ▼▼▼
  v_project  text    := '<project-ref>';        -- bv. mawctyhvciudaucrucmx
  v_sleutel  text    := '<service_role_key>';   -- Project Settings -> API
  v_embed    boolean := false;                  -- true als je 09_ai.sql en de functie embed gebruikt
  -- ▲▲▲ VUL DIT IN ▲▲▲

  v_basis text;
  v_kop   text;
  v_taak  text;
begin
  if v_project like '<%' or v_sleutel like '<%' then
    raise exception 'Vul bovenaan v_project en v_sleutel in.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron staat niet aan. Zet het aan in Database -> Extensions en draai dit opnieuw.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net staat niet aan. Zet het aan in Database -> Extensions en draai dit opnieuw.';
  end if;

  v_basis := format('https://%s.supabase.co/functions/v1/', v_project);
  v_kop   := json_build_object('Authorization', 'Bearer ' || v_sleutel)::text;

  -- Eerst weghalen wat er al stond, zodat opnieuw draaien veilig is.
  foreach v_taak in array array['push-notify', 'cleanup-storage', 'taken-herinneren', 'embed',
    'thuis-nightly', 'zorgnotities-opruimen', 'overdracht-opruimen', 'teamberichten-opruimen',
    'bewonerberichten-opruimen', 'nieuws-opruimen', 'uitstap-opruimen'] loop
    begin
      perform cron.unschedule(v_taak);
    exception when others then
      null;
    end;
  end loop;

  -- De nachtjob en de opruimtaken (dezelfde namen en uren als in hun migratie).
  perform cron.schedule('thuis-nightly',             '30 2 * * *', 'select public.run_nightly()');
  perform cron.schedule('zorgnotities-opruimen',     '20 3 * * *', 'select public.care_note_opruimen()');
  perform cron.schedule('overdracht-opruimen',       '25 3 * * *', 'select public.overdracht_opruimen()');
  perform cron.schedule('teamberichten-opruimen',    '30 3 * * *', 'select public.teambericht_opruimen()');
  perform cron.schedule('bewonerberichten-opruimen', '35 3 * * *', 'select public.bewonerbericht_opruimen()');
  perform cron.schedule('nieuws-opruimen',           '40 3 * * *', 'select public.nieuws_opruimen()');
  perform cron.schedule('uitstap-opruimen',          '45 3 * * *', 'select public.uitstap_opruimen()');

  -- Meldingen naar de toestellen van familie: elke vijf minuten.
  perform cron.schedule('push-notify', '*/5 * * * *', format(
    $c$select net.http_post(url := %L, headers := %L::jsonb)$c$,
    v_basis || 'push-notify', v_kop));

  -- Bestanden die nergens meer bij horen: elke nacht, na de nachtjob.
  perform cron.schedule('cleanup-storage', '50 3 * * *', format(
    $c$select net.http_post(url := %L, headers := %L::jsonb)$c$,
    v_basis || 'cleanup-storage', v_kop));

  -- Herinnering aan wie een taak op zich nam: elke ochtend om 07:00.
  perform cron.schedule('taken-herinneren', '0 7 * * *',
    'select public.task_reminders()');

  -- Embeddings voor de spraakassistent: elke nacht, na de nachtjob.
  if v_embed then
    perform cron.schedule('embed', '0 3 * * *', format(
      $c$select net.http_post(url := %L, headers := %L::jsonb)$c$,
      v_basis || 'embed', v_kop));
  end if;

  raise notice 'Ingepland. Controleer met de query onderaan.';
end
$$;

-- ---------------------------------------------------------------------
--  Controle: alle taken, en of ze de laatste keer gelukt zijn.
--  Verwacht: 10 taken (11 met embed). Na een nacht moet laatste_status
--  'succeeded' zijn. Bij push-notify en cleanup-storage betekent
--  'succeeded' alleen dat de oproep vertrok; of de functie zelf lukte,
--  zie je in Edge Functions -> Logs.
-- ---------------------------------------------------------------------
select j.jobname,
       j.schedule,
       j.active,
       r.status         as laatste_status,
       r.start_time     as laatste_keer,
       left(r.return_message, 80) as melding
from cron.job j
left join lateral (
  select status, start_time, return_message
  from cron.job_run_details d
  where d.jobid = j.jobid
  order by start_time desc
  limit 1
) r on true
order by j.jobname;
