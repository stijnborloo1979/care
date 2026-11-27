-- =====================================================================
--  LIFEANGLE — dringende meldingen meteen versturen, vanuit de database
--  Supabase migratie, versie 111
--
--  Draai dit na 110_tablet_ontkoppelen.sql.
--  Terugdraaien: supabase/rollback/111_push_meteen.sql
--
--  BESTAAND   een vraag van de tablet ("bel me", "ik heb hulp nodig")
--             kwam in public.notification, en daarna moest de TABLET zelf
--             push-notify aanroepen. Lukte dat niet — oude versie in de
--             cache, een netwerk dat even weg is, een aanmelding die net
--             ververst — dan wachtte de vraag op de cron: tot vijf minuten.
--             Soms meteen, soms minuten later: precies het soort gedrag
--             waar niemand op kan rekenen.
--  VOORGESTELD
--             de database porrt push-notify zelf aan, zodra er een melding
--             van niveau warn of alert bijkomt (pg_net, na de commit). De
--             tablet doet het daarnaast nog steeds; dubbel is geen probleem,
--             want push-notify verstuurt alleen wat nog niet verstuurd is.
--             De cron blijft als vangnet.
--  REDEN      een hulpvraag mag niet afhangen van het toestel dat ze stelt.
--  RISICO     laag. Mislukt het aanporren, dan gaat de melding gewoon mee
--             met de cron; het bewaren van de melding faalt nooit.
--
--  Eénmalig in te stellen (SQL-editor, NIET in een bestand bewaren)
--  ----------------------------------------------------------------
--    select vault.create_secret('<service_role-sleutel>', 'lifeangle_service_key');
--    select vault.create_secret('https://<project-ref>.supabase.co', 'lifeangle_url');
--
--  Zonder die twee doet de trigger niets, en werkt alles zoals voorheen.
-- =====================================================================

-- Porr push-notify aan. Zonder rechtencontrole, dus niet via de API.
create or replace function public.porr_push_nu()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sleutel text;
  v_url     text;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;

  begin
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'lifeangle_service_key'$q$
      into v_sleutel;
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'lifeangle_url'$q$
      into v_url;

    if v_sleutel is null or v_url is null then
      return;
    end if;

    -- pg_net verstuurt pas na de commit: push-notify ziet de melding dus al.
    execute $q$select net.http_post(url := $1, headers := $2, timeout_milliseconds := 30000)$q$
      using rtrim(v_url, '/') || '/functions/v1/push-notify',
            jsonb_build_object('Authorization', 'Bearer ' || v_sleutel);
  exception when others then
    -- Nooit de melding zelf laten mislukken: de cron neemt het over.
    raise notice 'push-notify niet aangepord: %', sqlerrm;
  end;
end;
$$;

revoke execute on function public.porr_push_nu() from public, anon, authenticated;

-- Alleen aanporren als er iets dringends bij zit. Info en ok wachten op
-- de cron. Eén keer per statement: een nachtjob met tien meldingen porrt
-- één keer.
create or replace function public.porr_push_als_dringend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from nieuw where level in ('warn', 'alert')) then
    perform public.porr_push_nu();
  end if;
  return null;
end;
$$;

revoke execute on function public.porr_push_als_dringend() from public, anon, authenticated;

drop trigger if exists notification_porr_push on public.notification;
create trigger notification_porr_push
  after insert on public.notification
  referencing new table as nieuw
  for each statement
  execute function public.porr_push_als_dringend();
