-- =====================================================================
--  THUIS — wie ze vroeg staat in de melding
--  Supabase migratie, versie 43
--
--  Draai dit na 42_gezien_sluit_de_reeks.sql.
--
--  Wat er misging
--  --------------
--  Op haar scherm kiest ze een naam: "Vraag of Els belt". Maar de melding die
--  familie kreeg, zei alleen "Maria vraagt of je eens belt" — zonder naam. En
--  omdat elke vraag dezelfde was, hield de wachttijd van drie minuten ook een
--  vraag aan iemand ánders tegen. Ze drukte op "Iemand anders vragen", koos
--  Jan, en er gebeurde niets.
--
--  Dat is twee keer hetzelfde probleem: de app gooide weg wat zij bedoelde.
--
--  Wat er nu gebeurt
--  -----------------
--  De naam gaat mee. "Maria vraagt of Els belt." Iedereen die meezorgt krijgt
--  het bericht — dat blijft zo, want alleen Els verwittigen zou betekenen dat
--  niemand het weet wanneer juist zij niet kan — maar nu staat erbij aan wie
--  ze dacht. Els weet dat het aan haar gevraagd is; Jan ziet dat hij kan
--  inspringen.
--
--  En een vraag aan iemand anders is nieuwe informatie, dus die wacht niet:
--  de wachttijd geldt per persoon, niet per huishouden. Twee keer hetzelfde
--  binnen drie minuten blijft één melding; Els en dan Jan zijn er twee.
-- =====================================================================

alter table public.notification
  add column if not exists betreft text;

comment on column public.notification.betreft is
  'Aan wie de persoon het vroeg. Leeg wanneer ze niemand in het bijzonder koos.';


-- De vorm met vijf argumenten uit 42 moet weg: naast de nieuwe zou een
-- aanroep met vijf argumenten niet meer te kiezen zijn.
drop function if exists public.vraag_iets(uuid, text, text, text, interval);

create or replace function public.vraag_iets(
  hh        uuid,
  sleutel   text,
  niveau    text,
  tekst     text,
  wachttijd interval,
  wie       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vorige   public.notification;
  n        integer := 0;
  zelfde   boolean := false;
  body     text;
begin
  select * into vorige
    from public.notification
   where household_id = hh and dedupe_key = sleutel
   limit 1;

  -- Dezelfde vraag als daarnet? Alleen dan is het een herhaling. Vraagt ze
  -- het aan iemand anders, dan is dat nieuwe informatie en begint de telling
  -- opnieuw — en wacht ze niet.
  zelfde := found and vorige.betreft is not distinct from wie;

  if zelfde
     and vorige.read_at is null
     and vorige.created_at > now() - interval '1 hour'
  then
    n := vorige.herhalingen + 1;
  end if;

  if zelfde
     and vorige.read_at is null
     and vorige.created_at > now() - wachttijd
  then
    update public.notification set herhalingen = n where id = vorige.id;
    return;
  end if;

  body := tekst;
  if n > 0 then
    body := body || ' (' || (n + 1)::text || 'e keer)';
  end if;

  delete from public.notification
   where household_id = hh and dedupe_key = sleutel;

  insert into public.notification
    (household_id, level, body, target_role, dedupe_key, herhalingen, betreft)
  values (hh, niveau, body, null, sleutel, n, wie);
end;
$$;

revoke execute on function public.vraag_iets(uuid, text, text, text, interval, text)
  from public, authenticated;


-- ---------------------------------------------------------------------
--  "Bel me eens", met de naam erbij
--
--  De naam komt van het scherm en niet uit de database, want het gaat om de
--  kaart die zij aantikte. Wel afgekapt en ontdaan van regeleindes: hij komt
--  in een pushbericht terecht.
-- ---------------------------------------------------------------------

-- Geen standaardwaarde voor "wie": met een default zou vraag_gesprek(hh)
-- naar twee functies tegelijk kunnen wijzen, en dan weigert Postgres te
-- kiezen. Dat brak bij de eerste test — en het zou ook de app geveld hebben
-- op het moment dat ze nog de oude aanroep gebruikte.
create or replace function public.vraag_gesprek(hh uuid, wie text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam  text;
  schoon text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  schoon := nullif(btrim(regexp_replace(coalesce(wie, ''), '\s+', ' ', 'g')), '');
  schoon := left(schoon, 40);

  perform public.vraag_iets(
    hh, 'terugbellen', 'warn',
    case
      when schoon is null then naam || ' vraagt of je eens belt.'
      else naam || ' vraagt of ' || schoon || ' belt.'
    end,
    interval '3 minutes',
    schoon
  );
end;
$$;

-- De oude vorm met één argument blijft bestaan, zodat een app die nog niet
-- bijgewerkt is niet stukloopt tijdens het uitrollen.
create or replace function public.vraag_gesprek(hh uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.vraag_gesprek(hh, null::text);
$$;

grant execute on function public.vraag_gesprek(uuid, text) to authenticated;
grant execute on function public.vraag_gesprek(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  "Ik heb hulp nodig" blijft zonder naam
--
--  Wie om hulp vraagt, vraagt het aan iedereen. Daar een naam aan hangen zou
--  suggereren dat de anderen kunnen wachten.
-- ---------------------------------------------------------------------

create or replace function public.vraag_hulp(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  perform public.vraag_iets(
    hh, 'hulp', 'alert',
    naam || ' heeft hulp nodig.',
    interval '2 minutes',
    null
  );
end;
$$;

grant execute on function public.vraag_hulp(uuid) to authenticated;
