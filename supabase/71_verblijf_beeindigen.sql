-- =====================================================================
--  LIFEANGLE Care — het woonzorgcentrum beëindigt een verblijf
--  Supabase migratie, versie 71
--
--  Draai dit na 70_medewerkers_beheren.sql.
--  Terugdraaien: supabase/rollback/71_verblijf_beeindigen.sql
--  Tests: supabase/tests/test_71_verblijf_beeindigen.sql
--
--  BESTAAND   alleen de familie kon de koppeling met een woonzorgcentrum
--             verbreken. Verhuist of overlijdt een bewoner, dan bleef hij in
--             de lijst van het WZC staan, en zijn team hield toegang.
--  VOORGESTELD beeindig_verblijf(hh, reden): de beheerder of coördinator van
--             het WZC sluit het verblijf af. Zelfde weg als wanneer de
--             familie ontkoppelt: household.org_id wordt leeg, het verblijf
--             eindigt (52) en alle toewijzingen eindigen mee. De reden staat
--             bij het verblijf. De familiebeheerder krijgt een melding en
--             het zorglogboek een regel. Niets van de familie wordt gewist.
--  REDEN      gevraagd: verblijf beëindigen bij verhuis of overlijden.
--  RISICO     laag. Opnieuw koppelen kan de familie altijd zelf met de
--             koppelcode. De melding noemt de reden niet: die kent de
--             familie, en een melding is niet de plek voor "overleden".
-- =====================================================================

do $$
begin
  if to_regclass('public.stay') is null then
    raise exception 'Draai eerst 52_stays.sql';
  end if;
end
$$;

alter table public.stay add column if not exists end_reason text;
alter table public.stay add column if not exists ended_by uuid references public.profile (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stay_end_reason_check') then
    alter table public.stay add constraint stay_end_reason_check
      check (end_reason is null or end_reason in ('verhuisd', 'overleden', 'andere'));
  end if;
end
$$;

comment on column public.stay.end_reason is
  'Waarom het woonzorgcentrum het verblijf afsloot (71). Leeg wanneer de familie ontkoppelde.';

create or replace function public.beeindig_verblijf(hh uuid, reden text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s public.stay;
  org_naam text;
begin
  select * into s from public.stay where household_id = hh and ended_at is null;
  if s.id is null then
    raise exception 'Deze bewoner verblijft niet (meer) in een woonzorgcentrum' using errcode = '22023';
  end if;
  if coalesce(public.org_role_of(s.org_id)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator van het woonzorgcentrum' using errcode = '42501';
  end if;
  if coalesce(reden, '') not in ('verhuisd', 'overleden', 'andere') then
    raise exception 'Kies een reden: verhuisd, overleden of andere' using errcode = '22023';
  end if;

  update public.stay set end_reason = reden, ended_by = auth.uid() where id = s.id;
  -- Dezelfde weg als ontkoppelen door de familie: het verblijf en de
  -- toewijzingen eindigen via de triggers van 52.
  update public.household set org_id = null where id = hh;
  -- Zoals unlink_household_from_org (03): oude zorgverlener-lidmaatschappen
  -- van medewerkers van dit WZC gaan mee weg.
  delete from public.membership m
   where m.household_id = hh and m.role = 'caregiver'
     and exists (select 1 from public.org_membership om where om.profile_id = m.profile_id and om.org_id = s.org_id);

  select name into org_naam from public.organisation where id = s.org_id;

  insert into public.notification (household_id, level, body, target_role)
  values (hh, 'info',
          format('%s heeft het verblijf afgesloten. Het zorgteam heeft geen toegang meer; alles blijft bij de familie.',
                 coalesce(org_naam, 'Het woonzorgcentrum')),
          'admin');

  if to_regclass('public.care_log') is not null then
    insert into public.care_log (household_id, occurred_at, title, note, author_id, source)
    values (hh, now(), 'Verblijf in het woonzorgcentrum afgesloten', org_naam, auth.uid(), 'system');
  end if;
end;
$$;

revoke execute on function public.beeindig_verblijf(uuid, text) from public, anon;
grant execute on function public.beeindig_verblijf(uuid, text) to authenticated;
