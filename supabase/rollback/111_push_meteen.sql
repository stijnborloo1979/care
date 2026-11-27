-- Terugdraaien van 111_push_meteen.sql. De geheimen in vault blijven staan;
-- wis ze zelf als je ze niet meer nodig hebt:
--   delete from vault.secrets where name in ('lifeangle_service_key', 'lifeangle_url');
drop trigger if exists notification_porr_push on public.notification;
drop function if exists public.porr_push_als_dringend();
drop function if exists public.porr_push_nu();
