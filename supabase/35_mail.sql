-- =====================================================================
--  THUIS — een tweede weg voor dringende meldingen: e-mail
--  Supabase migratie, versie 35
--
--  Draai dit na 20_push.sql en 34_push_nakijken.sql.
--
--  Waarom dit bestaat
--  ------------------
--  Pushmeldingen in de browser zijn niet overal te krijgen. Op iPhone en
--  iPad bestaan ze alleen wanneer de app op het beginscherm staat; een
--  werklaptop kan ze door beleid blokkeren; en wie ze één keer weigerde,
--  krijgt de vraag niet opnieuw. Voor gewone meldingen is dat te verdragen.
--  Voor de twee die de persoon zélf verstuurt — "bel me eens" en "ik heb
--  hulp nodig" — niet: die mogen niet afhangen van een browserinstelling.
--
--  Daarom gaat elke melding van niveau 'warn' of 'alert' ook per e-mail.
--  E-mail heeft geen toestemming nodig, werkt op elk toestel, en komt ook
--  aan wanneer niemand de app open heeft.
--
--  Twee bewuste verschillen met push
--  ---------------------------------
--   1. Geen 'info' en geen 'ok'. Een mailbox die volloopt met "ontbijt
--      afgevinkt" wordt genegeerd, en dan valt de ene mail die telt niet
--      meer op.
--   2. Geen fasevoorwaarde. pending_pushes() stuurt alleen in de fase
--      "ondersteund", want meekijken hoort bij die fase. Maar hier vraagt
--      de persoon zelf om contact — dat is geen toezicht, en dat mag in
--      elke fase aankomen.
--
--  Elk familielid beslist voor zichzelf (profile.preferences.mail_alerts).
--  Standaard staat het aan, want dit is het vangnet.
-- =====================================================================

alter table public.notification
  add column if not exists mailed_at timestamptz;

comment on column public.notification.mailed_at is
  'Wanneer deze melding per e-mail verstuurd is. Los van pushed_at: de twee wegen zijn onafhankelijk, zodat een kapotte push de mail niet tegenhoudt en omgekeerd.';

create index if not exists notification_te_mailen_idx
  on public.notification (created_at)
  where mailed_at is null;


-- ---------------------------------------------------------------------
--  1. Wat moet er gemaild worden
--
--  Alleen aanroepbaar met de service role, vanuit de edge function. Het
--  e-mailadres komt uit auth.users, en dat is precies waarom deze functie
--  niet voor authenticated openstaat: anders kon elk familielid de
--  adressen van de anderen uitlezen.
-- ---------------------------------------------------------------------

create or replace function public.pending_mails(limiet integer default 100)
returns table (
  notification_id uuid,
  adres           text,
  level           text,
  body            text,
  person_name     text
)
language sql
security definer
set search_path = public
as $$
  select n.id, u.email::text, n.level, n.body, h.person_name
    from public.notification n
    join public.household h on h.id = n.household_id
    join public.membership m on m.household_id = n.household_id
    join auth.users u on u.id = m.profile_id
    left join public.profile p on p.id = m.profile_id
   where n.mailed_at is null
     -- Alleen wat niet kan wachten. Zie de kop van dit bestand.
     and n.level in ('warn', 'alert')
     -- Niets van vannacht om vier uur nog om tien uur 's ochtends sturen.
     and n.created_at > now() - interval '2 hours'
     and m.role in ('admin', 'member')
     and (n.target_role is null or n.target_role = m.role)
     and u.email is not null
     and coalesce(p.preferences ->> 'mail_alerts', 'true') <> 'false'
   order by n.created_at
   limit limiet;
$$;

create or replace function public.mark_mailed(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.notification set mailed_at = now()
   where id = any(ids) and mailed_at is null;
$$;

revoke execute on function public.pending_mails(integer) from public, authenticated;
revoke execute on function public.mark_mailed(uuid[])    from public, authenticated;

comment on function public.pending_mails(integer) is
  'Dringende meldingen die nog niet gemaild zijn, met het adres van elk familielid dat ze wil. Alleen voor de service role: hier staan e-mailadressen in.';


-- ---------------------------------------------------------------------
--  2. Elk familielid beslist voor zichzelf
--
--  Samenvoegen in plaats van overschrijven: in preferences staan ook de
--  toegankelijkheidsinstellingen, en die mogen hier niet sneuvelen.
-- ---------------------------------------------------------------------

create or replace function public.set_mail_alerts(aan boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profile
     set preferences = coalesce(preferences, '{}'::jsonb)
                       || jsonb_build_object('mail_alerts', aan)
   where id = auth.uid();
$$;

grant execute on function public.set_mail_alerts(boolean) to authenticated;


-- ---------------------------------------------------------------------
--  3. De testmelding gaat nu langs beide wegen
--
--  Vervangt de versie uit 34_push_nakijken.sql. Niveau 'warn' in plaats
--  van 'info', want een test die maar één van de twee wegen aflegt,
--  bewijst niet wat je wil weten.
-- ---------------------------------------------------------------------

create or replace function public.test_push(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een testmelding sturen';
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = 'test';

  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'warn', 'Test: als je dit ziet, komen de dringende meldingen aan.', null, 'test');
end;
$$;

grant execute on function public.test_push(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  4. Hoeveel er wachten, voor het scherm
--
--  Vervangt push_status uit 34: er is nu een tweede weg om te tonen.
--  Merk op dat wachtend_mail géén fasevoorwaarde heeft, net zoals
--  pending_mails er geen heeft.
-- ---------------------------------------------------------------------

-- Eerst weg: push_status krijgt hier nieuwe kolommen, en create or replace
-- mag het rijtype van een bestaande functie niet wijzigen. Zonder deze
-- regel stopt de migratie met "cannot change return type".
drop function if exists public.push_status(uuid);

create function public.push_status(hh uuid)
returns table (
  toestellen     integer,
  eigen_toestel  boolean,
  niveau_ok      boolean,
  wachtend       integer,
  mail_aan       boolean,
  wachtend_mail  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int
       from public.push_subscription s
       join public.membership m on m.profile_id = s.profile_id
                               and m.household_id = s.household_id
      where s.household_id = hh and m.role in ('admin', 'member')),
    exists (select 1 from public.push_subscription s
             where s.household_id = hh and s.profile_id = auth.uid()),
    (select support_level = 'ondersteund' from public.household where id = hh),
    (select count(*)::int from public.notification n
      where n.household_id = hh
        and n.pushed_at is null
        and n.created_at > now() - interval '2 hours'),
    (select coalesce(p.preferences ->> 'mail_alerts', 'true') <> 'false'
       from public.profile p where p.id = auth.uid()),
    (select count(*)::int from public.notification n
      where n.household_id = hh
        and n.mailed_at is null
        and n.level in ('warn', 'alert')
        and n.created_at > now() - interval '2 hours')
  where public.auth_role(hh) in ('admin', 'member');
$$;

grant execute on function public.push_status(uuid) to authenticated;
