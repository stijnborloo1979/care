-- =====================================================================
--  THUIS — één melding, meerdere wegen
--  Supabase migratie, versie 36
--
--  Draai dit na 35_mail.sql.
--
--  Waarom dit bestaat
--  ------------------
--  35_mail.sql gaf de dringende meldingen een tweede weg: e-mail. Dat werkt,
--  maar een mail valt niet op. WhatsApp en Telegram komen op het
--  vergrendelscherm, zoals een gewoon bericht van een familielid — en dat is
--  wat een vraag om terug te bellen ook is.
--
--  In plaats van een derde en een vierde losse weg naast de mail, wordt het
--  hier één ding: een familielid heeft nul of meer kanalen, en elk kanaal
--  krijgt dezelfde melding. Mail hoort daar ook bij, zonder dat er een rij
--  voor nodig is — het adres staat al in auth.users.
--
--  Waarom een aparte tabel voor het afleveren
--  ------------------------------------------
--  Eerst stond er één vinkje op de melding zelf (pushed_at, mailed_at). Dat
--  werkt zolang er één ontvanger is. Met drie familieleden en twee kanalen
--  per persoon is "is deze melding verstuurd?" geen ja/nee meer, en dan
--  verdwijnt ze stil voor wie ze net niet kreeg.
--
--  notification_delivery houdt per melding, per persoon, per kanaal bij wat
--  er weg is. Wat er niet in staat, is nog niet bezorgd en gaat de volgende
--  ronde mee. Bijkomend voordeel: het scherm kan nu zeggen wie verwittigd
--  is, en dat is precies wat familie wil weten.
-- =====================================================================

create table if not exists public.alert_channel (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  profile_id   uuid not null references public.profile (id) on delete cascade,
  kind         text not null check (kind in ('whatsapp', 'telegram')),
  -- Voor whatsapp: een telefoonnummer in internationaal formaat (+32...).
  -- Voor telegram: de chat-id die de bot teruggaf.
  address      text not null,
  created_at   timestamptz not null default now(),
  unique (profile_id, kind)
);

comment on table public.alert_channel is
  'Hoe een familielid dringende meldingen wil krijgen, naast e-mail. Eén rij per persoon per soort. Iedereen beheert alleen zijn eigen rijen.';

comment on column public.alert_channel.address is
  'Telefoonnummer (+32...) voor whatsapp, chat-id voor telegram. Alleen leesbaar voor de eigenaar en voor de service role: het is een persoonsgegeven van een familielid, niet van het huishouden.';

alter table public.alert_channel enable row level security;

-- Alleen je eigen rijen, ook lezen. Een broer hoeft het nummer van zijn
-- zus niet te kunnen opvragen via de app.
drop policy if exists alert_channel_self on public.alert_channel;
create policy alert_channel_self on public.alert_channel for all
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and public.auth_role(household_id) in ('admin', 'member')
  );


create table if not exists public.notification_delivery (
  notification_id uuid not null references public.notification (id) on delete cascade,
  profile_id      uuid not null references public.profile (id) on delete cascade,
  kind            text not null check (kind in ('mail', 'whatsapp', 'telegram')),
  sent_at         timestamptz not null default now(),
  primary key (notification_id, profile_id, kind)
);

comment on table public.notification_delivery is
  'Wat er van een melding werkelijk verstuurd is, per persoon en per kanaal. Wat hier niet in staat, gaat de volgende ronde mee.';

alter table public.notification_delivery enable row level security;

-- Alleen de service role schrijft hier. Familie mag lezen wat er over hun
-- eigen huishouden verstuurd is, zodat het scherm kan zeggen wie verwittigd
-- is.
drop policy if exists delivery_read on public.notification_delivery;
create policy delivery_read on public.notification_delivery for select
  using (
    exists (
      select 1 from public.notification n
       where n.id = notification_id
         and public.auth_role(n.household_id) in ('admin', 'member')
    )
  );


-- ---------------------------------------------------------------------
--  1. Wat moet er nog verstuurd worden
--
--  Alleen aanroepbaar met de service role: hier staan e-mailadressen en
--  telefoonnummers van familieleden in.
--
--  Mail is een kanaal zonder rij: het adres komt uit auth.users, en de
--  voorkeur uit profile.preferences.mail_alerts (standaard aan). Dat houdt
--  het vangnet werkend voor wie niets instelt.
-- ---------------------------------------------------------------------

create or replace function public.pending_alerts(limiet integer default 100)
returns table (
  notification_id uuid,
  profile_id      uuid,
  kind            text,
  address         text,
  level           text,
  body            text,
  person_name     text
)
language sql
security definer
set search_path = public
as $$
  with dringend as (
    select n.id, n.level, n.body, n.target_role, n.created_at, n.household_id,
           h.person_name
      from public.notification n
      join public.household h on h.id = n.household_id
     -- Alleen wat niet kan wachten. Een kanaal dat volloopt met "ontbijt
     -- afgevinkt" wordt genegeerd, en dan valt het ene bericht dat telt
     -- niet meer op.
     where n.level in ('warn', 'alert')
       -- Niets van vannacht om vier uur nog om tien uur 's ochtends sturen.
       and n.created_at > now() - interval '2 hours'
  ),
  ontvangers as (
    select d.id, d.level, d.body, d.person_name, d.created_at,
           m.profile_id, 'mail'::text as kind, u.email::text as address
      from dringend d
      join public.membership m on m.household_id = d.household_id
      join auth.users u on u.id = m.profile_id
      left join public.profile p on p.id = m.profile_id
     where m.role in ('admin', 'member')
       and (d.target_role is null or d.target_role = m.role)
       and u.email is not null
       and coalesce(p.preferences ->> 'mail_alerts', 'true') <> 'false'

    union all

    select d.id, d.level, d.body, d.person_name, d.created_at,
           m.profile_id, c.kind, c.address
      from dringend d
      join public.membership m on m.household_id = d.household_id
      join public.alert_channel c on c.profile_id = m.profile_id
                                 and c.household_id = d.household_id
     where m.role in ('admin', 'member')
       and (d.target_role is null or d.target_role = m.role)
  )
  select o.id, o.profile_id, o.kind, o.address, o.level, o.body, o.person_name
    from ontvangers o
   where not exists (
     select 1 from public.notification_delivery v
      where v.notification_id = o.id
        and v.profile_id = o.profile_id
        and v.kind = o.kind
   )
   order by o.created_at
   limit limiet;
$$;

comment on function public.pending_alerts(integer) is
  'Dringende meldingen die nog niet bezorgd zijn, één rij per ontvanger per kanaal. Alleen voor de service role: hier staan adressen en telefoonnummers in.';


-- ---------------------------------------------------------------------
--  2. Afvinken
--
--  Eén rij per werkelijk verstuurd bericht. Een dubbele invoer is geen fout
--  maar een herhaling: on conflict do nothing.
-- ---------------------------------------------------------------------

create or replace function public.mark_alerts(rijen jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  aantal integer;
begin
  insert into public.notification_delivery (notification_id, profile_id, kind)
  select (r ->> 'notification_id')::uuid,
         (r ->> 'profile_id')::uuid,
         r ->> 'kind'
    from jsonb_array_elements(coalesce(rijen, '[]'::jsonb)) as r
  on conflict do nothing;

  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

revoke execute on function public.pending_alerts(integer) from public, authenticated;
revoke execute on function public.mark_alerts(jsonb)      from public, authenticated;


-- ---------------------------------------------------------------------
--  3. Je eigen kanaal instellen
--
--  Het adres wordt hier genormaliseerd, niet in de app: een nummer dat als
--  "0475 12 34 56" binnenkomt, werkt niet bij WhatsApp. Eén plaats waar dat
--  gebeurt is één plaats om na te kijken.
-- ---------------------------------------------------------------------

create or replace function public.set_alert_channel(hh uuid, soort text, adres text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ruw    text := trim(coalesce(adres, ''));
  cijfer text;
  schoon text;
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een kanaal instellen';
  end if;
  if soort not in ('whatsapp', 'telegram') then
    raise exception 'Onbekend kanaal: %', soort;
  end if;

  if ruw = '' then
    delete from public.alert_channel
     where profile_id = auth.uid() and kind = soort;
    return;
  end if;

  -- Alles weg wat geen cijfer is, en dan opnieuw opbouwen. Een lijst van te
  -- verwijderen tekens ("spatie, streepje, punt") is altijd te kort: bij de
  -- eerste test kwam er een schuine streep uit — 0032 475/12.34.56 — en die
  -- stond er niet in. Omgekeerd redeneren kan niet te kort zijn.
  cijfer := regexp_replace(ruw, '[^0-9]', '', 'g');

  if soort = 'whatsapp' then
    -- Een bericht naar het verkeerde nummer is erger dan geen bericht, dus
    -- alleen vormen die niet te raden zijn:
    --   +32475123456  al goed
    --   0032475123456 internationaal met 00
    --   0475123456    een Belgisch nummer; alleen hier vullen we +32 aan
    if left(ruw, 1) = '+' then
      schoon := '+' || cijfer;
    elsif cijfer ~ '^00[1-9][0-9]{6,14}$' then
      schoon := '+' || substring(cijfer from 3);
    elsif cijfer ~ '^0[1-9][0-9]{7,8}$' then
      schoon := '+32' || substring(cijfer from 2);
    else
      raise exception 'Zet het nummer in internationaal formaat, bijvoorbeeld +32475123456';
    end if;

    if schoon !~ '^\+[1-9][0-9]{6,14}$' then
      raise exception 'Zet het nummer in internationaal formaat, bijvoorbeeld +32475123456';
    end if;
  else
    -- Een Telegram chat-id is een getal, negatief voor een groep.
    schoon := case when left(ruw, 1) = '-' then '-' || cijfer else cijfer end;
    if schoon !~ '^-?[0-9]{5,20}$' then
      raise exception 'Een Telegram chat-id is een getal, bijvoorbeeld 123456789';
    end if;
  end if;

  insert into public.alert_channel (household_id, profile_id, kind, address)
  values (hh, auth.uid(), soort, schoon)
  on conflict (profile_id, kind) do update
    set address = excluded.address, household_id = excluded.household_id;
end;
$$;

grant execute on function public.set_alert_channel(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
--  4. Wat het scherm moet weten
--
--  Vervangt push_status uit 35_mail.sql: "wachtend_mail" wordt "wachtend_weg"
--  — wat er nog niet bezorgd is, langs welk kanaal dan ook.
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
  wachtend_weg   integer,
  eigen_kanalen  jsonb
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
    -- Meldingen waarvan voor mij nog minstens één weg openstaat.
    --
    -- Per kanaal kijken, niet per melding: stond de mail weg en de WhatsApp
    -- nog niet, dan telde ze niet meer mee en zei het scherm dat alles in
    -- orde was terwijl er nog iets vastzat.
    (select count(distinct n.id)::int
       from public.notification n
       cross join (
         select 'mail'::text as kind
          where coalesce(
                  (select p.preferences ->> 'mail_alerts'
                     from public.profile p where p.id = auth.uid()),
                  'true') <> 'false'
         union all
         select c.kind from public.alert_channel c
          where c.profile_id = auth.uid() and c.household_id = hh
       ) k
      where n.household_id = hh
        and n.level in ('warn', 'alert')
        and n.created_at > now() - interval '2 hours'
        and not exists (
          select 1 from public.notification_delivery v
           where v.notification_id = n.id
             and v.profile_id = auth.uid()
             and v.kind = k.kind
        )),
    -- Mijn eigen kanalen, zodat het scherm ze kan tonen zonder de tabel
    -- rechtstreeks te bevragen.
    coalesce(
      (select jsonb_object_agg(c.kind, c.address)
         from public.alert_channel c
        where c.profile_id = auth.uid() and c.household_id = hh),
      '{}'::jsonb)
  where public.auth_role(hh) in ('admin', 'member');
$$;

grant execute on function public.push_status(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  5. Realtime
--
--  De snelste weg van allemaal, en de goedkoopste: binnen een seconde, geen
--  toestemming, geen kosten. Werkt zolang de app ergens open staat, en dat
--  is precies wat pushmeldingen in de browser níet nodig maakt op een
--  toestel dat ze weigert.
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.notification;
exception when others then null;
end
$$;
