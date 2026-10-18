-- =====================================================================
--  LIFEANGLE Care — registratie van een woonzorgcentrum, gesplitst
--  Supabase migratie, versie 98
--
--  Draai dit na 97_verhaal_bij_foto.sql.
--  Terugdraaien: supabase/rollback/98_org_registratie.sql
--  Tests: supabase/tests/test_98_org_registratie.sql
--
--  BESTAAND   iedere ingelogde gebruiker kon met create_organisation()
--             een WZC aanmaken. Die werd meteen actief, de aanmaker werd
--             beheerder, en de koppelcode was direct bruikbaar. Met een
--             nep-WZC kon je families laten koppelen en de bewoners zien.
--  VOORGESTELD
--    Platform (LifeAngle)  een aanvraag indienen, telefonisch controleren
--                          door een platformbeheerder, en door een tweede
--                          platformbeheerder goedkeuren. Pas dan ontstaat
--                          een organisatie: niet actief, met een uitnodiging
--                          voor de contactpersoon als beheerder.
--    Activeren             alleen met twee beheerders en een verwerkers-
--                          overeenkomst (dpa_referentie).
--    Organisatie (WZC)     de beheerders beheren zelf hun medewerkers.
--                          Er moeten altijd minstens twee beheerders zijn
--                          zodra het WZC actief is. Alleen de beheerder
--                          beëindigt een verblijf (niet de coördinator).
--                          Elke wijziging van een beheerder komt in
--                          platform_log, die het platform kan inzien.
--  RISICO     middel. create_organisation verdwijnt voor gebruikers; de
--             app-route /zorg/nieuw werkt pas na de frontend-wijziging.
--             active blijft standaard true, zodat bestaande tests en de
--             demo ongewijzigd werken. Nieuwe organisaties uit de
--             aanvraagstroom zijn altijd niet actief.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Platformbeheerders en het platformlogboek
-- ---------------------------------------------------------------------

create table if not exists public.platform_beheerder (
  profile_id  uuid primary key references public.profile (id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.platform_beheerder is
  'LifeAngle-medewerkers die aanvragen controleren en goedkeuren. Alleen via de service role te wijzigen.';

alter table public.platform_beheerder enable row level security;
revoke all on public.platform_beheerder from anon, authenticated;

create or replace function public.is_platform_beheerder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_beheerder where profile_id = auth.uid());
$$;

revoke execute on function public.is_platform_beheerder() from public, anon;
grant execute on function public.is_platform_beheerder() to authenticated, service_role;


create table if not exists public.platform_log (
  id          uuid primary key default gen_random_uuid(),
  soort       text not null,
  org_id      uuid references public.organisation (id) on delete set null,
  profile_id  uuid references public.profile (id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.platform_log is
  'Wijzigingen die het platform moet kunnen zien: aanvragen, goedkeuringen en wijzigingen van beheerders van een WZC.';
create index if not exists platform_log_tijd_idx on public.platform_log (created_at desc);

alter table public.platform_log enable row level security;
revoke all on public.platform_log from anon, authenticated;

create or replace function public.platform_log_lijst(van integer default 100)
returns setof public.platform_log
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  return query select * from public.platform_log order by created_at desc limit greatest(van, 1);
end;
$$;

revoke execute on function public.platform_log_lijst(integer) from public, anon;
grant execute on function public.platform_log_lijst(integer) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  2. De aanvraag
-- ---------------------------------------------------------------------

alter table public.organisation add column if not exists dpa_referentie text;
alter table public.organisation add column if not exists dpa_getekend_op timestamptz;
comment on column public.organisation.dpa_referentie is
  'Verwijzing naar de getekende verwerkersovereenkomst. Zonder deze waarde wordt een WZC niet geactiveerd.';

create table if not exists public.org_aanvraag (
  id                          uuid primary key default gen_random_uuid(),
  naam                        text not null,
  ondernemingsnummer          text not null,
  erkenningsnummer            text,
  adres                       text not null,
  contact_naam                text not null,
  contact_email               text not null,
  telefoon                    text not null,
  status                      text not null default 'ingediend'
                              check (status in ('ingediend', 'gecontroleerd', 'goedgekeurd', 'afgewezen')),
  aangevraagd_door            uuid not null references public.profile (id) on delete cascade,
  telefoon_gecontroleerd_door uuid references public.profile (id) on delete set null,
  telefoon_gecontroleerd_op   timestamptz,
  besluit_door               uuid references public.profile (id) on delete set null,
  besluit_op                 timestamptz,
  org_id                     uuid references public.organisation (id) on delete set null,
  notitie                    text,
  created_at                 timestamptz not null default now(),
  constraint org_aanvraag_ondernemingsnummer_check check (ondernemingsnummer ~ '^[01][0-9]{9}$'),
  -- Wie telefonisch controleert, mag niet ook goedkeuren.
  constraint org_aanvraag_twee_personen_check check (
    besluit_door is null or telefoon_gecontroleerd_door is null
    or besluit_door <> telefoon_gecontroleerd_door),
  constraint org_aanvraag_gecontroleerd_check check (
    status <> 'gecontroleerd' or telefoon_gecontroleerd_door is not null),
  constraint org_aanvraag_goedgekeurd_check check (
    status <> 'goedgekeurd' or (
      telefoon_gecontroleerd_door is not null and besluit_door is not null
      and besluit_door <> telefoon_gecontroleerd_door and org_id is not null))
);
comment on table public.org_aanvraag is
  'Een aanvraag voor een WZC-account. Ontstaat er pas een organisatie na controle en goedkeuring door twee platformbeheerders.';

-- Per ondernemingsnummer maar één open aanvraag.
create unique index if not exists org_aanvraag_open_nummer_idx
  on public.org_aanvraag (ondernemingsnummer)
  where status in ('ingediend', 'gecontroleerd');

alter table public.org_aanvraag enable row level security;
revoke all on public.org_aanvraag from anon, authenticated;


-- Gratis en providerdomeinen zijn geen WZC-domein.
create or replace function public.gratis_mail_domein(dom text)
returns boolean
language sql
immutable
as $$
  select lower(dom) = any (array[
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.be', 'outlook.com', 'outlook.be',
    'live.com', 'live.be', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'gmx.com', 'gmx.net',
    'protonmail.com', 'telenet.be', 'proximus.be', 'skynet.be', 'belgacom.net'
  ]);
$$;

create or replace function public.dien_org_aanvraag(
  naam text,
  ondernemingsnummer text,
  erkenningsnummer text,
  adres text,
  contact_naam text,
  contact_email text,
  telefoon text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  nr   text := regexp_replace(coalesce(ondernemingsnummer, ''), '[^0-9]', '', 'g');
  mail text := lower(btrim(coalesce(contact_email, '')));
  id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  if btrim(coalesce(naam, '')) = '' or btrim(coalesce(adres, '')) = ''
     or btrim(coalesce(contact_naam, '')) = '' or btrim(coalesce(telefoon, '')) = '' then
    raise exception 'Vul alle velden in' using errcode = '22023';
  end if;
  if nr !~ '^[01][0-9]{9}$' then
    raise exception 'Een ondernemingsnummer heeft tien cijfers' using errcode = '22023';
  end if;
  if position('@' in mail) = 0 or split_part(mail, '@', 2) = '' then
    raise exception 'Geen geldig e-mailadres' using errcode = '22023';
  end if;
  if public.gratis_mail_domein(split_part(mail, '@', 2)) then
    raise exception 'Gebruik het e-mailadres van het woonzorgcentrum zelf' using errcode = '22023';
  end if;
  if (select count(*) from public.org_aanvraag
       where aangevraagd_door = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Te veel aanvragen vandaag' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_aanvraag
              where org_aanvraag.ondernemingsnummer = nr and org_aanvraag.status in ('ingediend', 'gecontroleerd')) then
    raise exception 'Er loopt al een aanvraag voor dit ondernemingsnummer' using errcode = '23505';
  end if;

  insert into public.org_aanvraag
    (naam, ondernemingsnummer, erkenningsnummer, adres, contact_naam, contact_email, telefoon, aangevraagd_door)
  values
    (btrim(naam), nr, nullif(btrim(coalesce(erkenningsnummer, '')), ''), btrim(adres),
     btrim(contact_naam), mail, btrim(telefoon), auth.uid())
  returning org_aanvraag.id into id;

  return id;
end;
$$;

revoke execute on function public.dien_org_aanvraag(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.dien_org_aanvraag(text, text, text, text, text, text, text) to authenticated;


-- De aanvrager ziet alleen de status van de eigen aanvragen.
create or replace function public.mijn_org_aanvragen()
returns table (id uuid, naam text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.naam, a.status, a.created_at
    from public.org_aanvraag a
   where a.aangevraagd_door = auth.uid()
   order by a.created_at desc;
$$;

revoke execute on function public.mijn_org_aanvragen() from public, anon;
grant execute on function public.mijn_org_aanvragen() to authenticated;


-- ---------------------------------------------------------------------
--  3. Controle en goedkeuring door het platform
-- ---------------------------------------------------------------------

create or replace function public.platform_aanvragen()
returns setof public.org_aanvraag
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  return query select * from public.org_aanvraag order by created_at desc;
end;
$$;

revoke execute on function public.platform_aanvragen() from public, anon;
grant execute on function public.platform_aanvragen() to authenticated, service_role;


create or replace function public.controleer_org_aanvraag(aanvraag uuid, notitie text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  update public.org_aanvraag
     set status = 'gecontroleerd',
         telefoon_gecontroleerd_door = auth.uid(),
         telefoon_gecontroleerd_op = now(),
         notitie = coalesce(controleer_org_aanvraag.notitie, org_aanvraag.notitie)
   where id = aanvraag and status = 'ingediend';
  if not found then
    raise exception 'Deze aanvraag kan niet meer gecontroleerd worden' using errcode = '22023';
  end if;
  insert into public.platform_log (soort, profile_id, detail)
  values ('aanvraag_gecontroleerd', auth.uid(), jsonb_build_object('aanvraag', aanvraag));
end;
$$;

revoke execute on function public.controleer_org_aanvraag(uuid, text) from public, anon;
grant execute on function public.controleer_org_aanvraag(uuid, text) to authenticated, service_role;


create or replace function public.keur_org_aanvraag_goed(aanvraag uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a    public.org_aanvraag;
  o    uuid;
  t    text;
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  select * into a from public.org_aanvraag where id = aanvraag for update;
  if a.id is null or a.status <> 'gecontroleerd' then
    raise exception 'Deze aanvraag is niet gecontroleerd' using errcode = '22023';
  end if;
  if a.telefoon_gecontroleerd_door = auth.uid() then
    raise exception 'Een tweede platformbeheerder moet goedkeuren' using errcode = '42501';
  end if;

  -- Niet actief: pas na de verwerkersovereenkomst en twee beheerders.
  insert into public.organisation (name, contact_email, vat_number, active)
  values (a.naam, a.contact_email, a.ondernemingsnummer, false)
  returning id into o;

  -- De contactpersoon wordt beheerder via de bestaande uitnodigingsstroom.
  t := replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');
  insert into public.org_invitation (org_id, email, role, token, invited_by)
  values (o, a.contact_email, 'org_admin', t, auth.uid());

  update public.org_aanvraag
     set status = 'goedgekeurd', besluit_door = auth.uid(), besluit_op = now(), org_id = o
   where id = a.id;

  insert into public.platform_log (soort, org_id, profile_id, detail)
  values ('organisatie_aangemaakt', o, auth.uid(), jsonb_build_object('aanvraag', a.id));

  return o;
end;
$$;

revoke execute on function public.keur_org_aanvraag_goed(uuid) from public, anon;
grant execute on function public.keur_org_aanvraag_goed(uuid) to authenticated, service_role;


create or replace function public.wijs_org_aanvraag_af(aanvraag uuid, reden text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  if btrim(coalesce(reden, '')) = '' then
    raise exception 'Geef een reden' using errcode = '22023';
  end if;
  update public.org_aanvraag
     set status = 'afgewezen', besluit_door = auth.uid(), besluit_op = now(), notitie = btrim(reden)
   where id = aanvraag and status in ('ingediend', 'gecontroleerd');
  if not found then
    raise exception 'Deze aanvraag kan niet meer afgewezen worden' using errcode = '22023';
  end if;
  insert into public.platform_log (soort, profile_id, detail)
  values ('aanvraag_afgewezen', auth.uid(), jsonb_build_object('aanvraag', aanvraag));
end;
$$;

revoke execute on function public.wijs_org_aanvraag_af(uuid, text) from public, anon;
grant execute on function public.wijs_org_aanvraag_af(uuid, text) to authenticated, service_role;


create or replace function public.activeer_organisatie(org uuid, dpa text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  if btrim(coalesce(dpa, '')) = '' then
    raise exception 'Een verwerkersovereenkomst is nodig om te activeren' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organisation where id = org) then
    raise exception 'Onbekende organisatie' using errcode = '22023';
  end if;
  select count(*) into n from public.org_membership
   where org_id = org and role = 'org_admin' and active;
  if n < 2 then
    raise exception 'Een WZC heeft minimaal twee beheerders nodig voordat het actief wordt' using errcode = '22023';
  end if;

  update public.organisation
     set active = true, dpa_referentie = btrim(dpa), dpa_getekend_op = now()
   where id = org;
  insert into public.platform_log (soort, org_id, profile_id, detail)
  values ('organisatie_geactiveerd', org, auth.uid(), '{}'::jsonb);
end;
$$;

revoke execute on function public.activeer_organisatie(uuid, text) from public, anon;
grant execute on function public.activeer_organisatie(uuid, text) to authenticated, service_role;


-- Overzicht voor de platformbeheerder: bestaande organisaties die nog
-- niet zijn gecontroleerd. Er wordt niets automatisch uitgezet.
create or replace function public.platform_organisaties_controle()
returns table (
  id uuid,
  name text,
  contact_email text,
  created_at timestamptz,
  active boolean,
  beheerders integer,
  huishoudens integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_beheerder() then
    raise exception 'Alleen een platformbeheerder' using errcode = '42501';
  end if;
  return query
    select o.id, o.name, o.contact_email, o.created_at, o.active,
           (select count(*)::integer from public.org_membership m
             where m.org_id = o.id and m.role = 'org_admin' and m.active),
           (select count(*)::integer from public.stay s
             where s.org_id = o.id and s.ended_at is null)
      from public.organisation o
     where o.dpa_referentie is null
     order by o.created_at;
end;
$$;

revoke execute on function public.platform_organisaties_controle() from public, anon;
grant execute on function public.platform_organisaties_controle() to authenticated, service_role;


-- ---------------------------------------------------------------------
--  4. Aanmaken van een WZC is niet meer vrij
-- ---------------------------------------------------------------------

revoke execute on function public.create_organisation(text, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
--  5. Regels voor beheerders binnen een WZC
--
--  Op de tabel zelf, zodat ze ook gelden bij een directe wijziging en
--  niet alleen via een functie.
-- ---------------------------------------------------------------------

create or replace function public.org_beheerder_regels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o_actief boolean;
  n        integer;
begin
  -- Een actief WZC houdt minstens twee beheerders.
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'org_admin' and old.active then
    if tg_op = 'DELETE' or new.role <> 'org_admin' or not new.active then
      select (active and not demo) into o_actief from public.organisation where id = old.org_id;
      if coalesce(o_actief, false) then
        select count(*) into n from public.org_membership
         where org_id = old.org_id and role = 'org_admin' and active and id <> old.id;
        if n < 2 then
          raise exception 'Een WZC heeft minimaal twee beheerders nodig' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  -- Elke wijziging van een beheerder komt in het platformlogboek.
  if tg_op = 'INSERT' and new.role = 'org_admin' then
    insert into public.platform_log (soort, org_id, profile_id, detail)
    values ('beheerder_toegevoegd', new.org_id, new.profile_id, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and (old.role = 'org_admin' or new.role = 'org_admin')
        and (old.role is distinct from new.role or old.active is distinct from new.active) then
    insert into public.platform_log (soort, org_id, profile_id, detail)
    values ('beheerder_gewijzigd', new.org_id, new.profile_id,
            jsonb_build_object('van', old.role, 'naar', new.role,
                               'actief_van', old.active, 'actief_naar', new.active,
                               'door', auth.uid()));
  elsif tg_op = 'DELETE' and old.role = 'org_admin' then
    insert into public.platform_log (soort, org_id, profile_id, detail)
    values ('beheerder_verwijderd', old.org_id, old.profile_id,
            jsonb_build_object('door', auth.uid()));
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.org_beheerder_regels() from public, anon, authenticated;

drop trigger if exists org_membership_beheerder_regels on public.org_membership;
create trigger org_membership_beheerder_regels
  before insert or update or delete on public.org_membership
  for each row execute function public.org_beheerder_regels();


create or replace function public.org_uitnodiging_loggen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'org_admin' then
    insert into public.platform_log (soort, org_id, profile_id, detail)
    values ('beheerder_uitgenodigd', new.org_id, new.invited_by,
            jsonb_build_object('email', new.email));
  end if;
  return new;
end;
$$;

revoke execute on function public.org_uitnodiging_loggen() from public, anon, authenticated;

drop trigger if exists org_invitation_beheerder_loggen on public.org_invitation;
create trigger org_invitation_beheerder_loggen
  after insert on public.org_invitation
  for each row execute function public.org_uitnodiging_loggen();


-- ---------------------------------------------------------------------
--  6. Koppelcode alleen voor een actieve organisatie
--     (herschreven vanaf 60; de inhoud is gelijk behalve "and active")
-- ---------------------------------------------------------------------

create or replace function public.org_koppelcode(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select koppelcode from public.organisation
   where id = org and active
     and coalesce(public.org_role_of(org)::text, '') in ('org_admin', 'coordinator');
$$;


-- ---------------------------------------------------------------------
--  7. Alleen de beheerder beëindigt een verblijf
--     (herschreven vanaf 71; de enige wijziging is de rol)
-- ---------------------------------------------------------------------

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
  if coalesce(public.org_role_of(s.org_id)::text, '') <> 'org_admin' then
    raise exception 'Alleen de beheerder van het woonzorgcentrum beëindigt een verblijf' using errcode = '42501';
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
