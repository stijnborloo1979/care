-- Terugdraaien van 71_verblijf_beeindigen.sql
-- De kolommen blijven staan als er al redenen in zitten; anders weg.
drop function if exists public.beeindig_verblijf(uuid, text);
do $$
begin
  if not exists (select 1 from public.stay where end_reason is not null or ended_by is not null) then
    alter table public.stay drop constraint if exists stay_end_reason_check;
    alter table public.stay drop column if exists end_reason;
    alter table public.stay drop column if exists ended_by;
  else
    raise notice 'end_reason en ended_by blijven staan: er zijn al verblijven met een reden.';
  end if;
end
$$;
