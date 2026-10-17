-- Terugdraaien van 92_medicatie_kwartier.sql.
-- Haalt de kwartierlijke controle weg. De nachtelijke controle blijft zoals hij was.

select cron.unschedule('medicatie-kwartier');
drop function if exists public.controleer_medicatie_overdag();
