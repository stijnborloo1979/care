-- Terugdraaien van 80_uitstap.sql
-- Weigert zodra er een uitstap gemeld is: dat is ook een veiligheidsspoor.
do $$
begin
  if to_regclass('public.uitstap') is not null and exists (select 1 from public.uitstap) then
    raise exception 'Er staan uitstappen in uitstap. Bewaar of wis ze eerst bewust.';
  end if;
end
$$;
do $$ begin perform cron.unschedule('uitstap-opruimen'); exception when others then null; end $$;
drop function if exists public.uitstap_stap(uuid, text);
drop function if exists public.uitstap_opruimen();
drop table if exists public.uitstap;
drop function if exists public.uitstap_nieuw();
