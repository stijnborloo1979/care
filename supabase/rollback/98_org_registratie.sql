-- Terugdraaien van 98_org_registratie.sql
-- Herstelt de situatie van vóór 98: create_organisation weer open, de oude
-- koppelcode-functie (60) en de oude beeindig_verblijf (71).
-- De tabellen platform_log en org_aanvraag worden alleen weggegooid als ze
-- leeg zijn; anders blijven ze staan en wordt er een melding gegeven.

drop trigger if exists org_invitation_beheerder_loggen on public.org_invitation;
drop function if exists public.org_uitnodiging_loggen();

drop trigger if exists org_membership_beheerder_regels on public.org_membership;
drop function if exists public.org_beheerder_regels();

-- Koppelcode en beëindigen zoals ze vóór 98 waren.
create or replace function public.org_koppelcode(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select koppelcode from public.organisation
   where id = org and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;

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
  update public.household set org_id = null where id = hh;
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

-- Functies van 98 weg.
drop function if exists public.keur_org_aanvraag_goed(uuid);
drop function if exists public.wijs_org_aanvraag_af(uuid, text);
drop function if exists public.controleer_org_aanvraag(uuid, text);
drop function if exists public.platform_aanvragen();
drop function if exists public.platform_organisaties_controle();
drop function if exists public.activeer_organisatie(uuid, text);
drop function if exists public.mijn_org_aanvragen();
drop function if exists public.dien_org_aanvraag(text, text, text, text, text, text, text);
drop function if exists public.gratis_mail_domein(text);
drop function if exists public.platform_log_lijst(integer);
drop function if exists public.is_platform_beheerder();

-- create_organisation weer open, zoals in 03.
grant execute on function public.create_organisation(text, text) to authenticated;

-- Veilig om opnieuw te draaien: wat er niet (meer) is, wordt overgeslagen.
do $$
begin
  if to_regclass('public.org_aanvraag') is not null then
    if not exists (select 1 from public.org_aanvraag) then
      drop table public.org_aanvraag;
    else
      raise notice 'org_aanvraag blijft staan: er zijn al aanvragen.';
    end if;
  end if;

  if to_regclass('public.platform_log') is not null then
    if not exists (select 1 from public.platform_log) then
      drop table public.platform_log;
    else
      raise notice 'platform_log blijft staan: er staat al een logregel in.';
    end if;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'organisation' and column_name = 'dpa_referentie') then
    if not exists (select 1 from public.organisation where dpa_referentie is not null) then
      alter table public.organisation drop column dpa_referentie;
      alter table public.organisation drop column if exists dpa_getekend_op;
    else
      raise notice 'dpa_referentie blijft staan: er zijn al activaties.';
    end if;
  end if;

  drop table if exists public.platform_beheerder;
end
$$;
