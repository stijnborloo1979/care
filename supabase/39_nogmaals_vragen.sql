-- =====================================================================
--  THUIS — nog eens vragen mag familie wél bereiken
--  Supabase migratie, versie 39
--
--  Draai dit na 30_terugbellen.sql en 33_hulp.sql.
--
--  Wat er misging
--  --------------
--  Maria vraagt of iemand belt: de melding komt aan. Ze wacht, er gebeurt
--  niets, ze vraagt het vijf minuten later opnieuw — en dan komt er niets
--  meer. Op haar scherm staat wel "Jens weet het", dus zij denkt dat het
--  gelukt is.
--
--  Dat was mijn eigen regel: tien minuten stilte tussen twee vragen, om te
--  voorkomen dat twaalf keer drukken twaalf meldingen geeft. Die redenering
--  klopt voor de derde druk binnen een minuut. Ze klopt niet voor iemand die
--  het na vijf minuten opnieuw vraagt: die doet dat juist omdát er niemand
--  belde. Precies de vraag die het dringendst is, kwam niet aan.
--
--  Wat er nu gebeurt
--  -----------------
--  De stilte gaat van tien minuten naar drie, en de herhaling wordt zichtbaar
--  in plaats van weggegooid: "Maria vraagt of je eens belt (3e keer)". Drukken
--  binnen die drie minuten telt gewoon mee — de teller loopt op, en bij de
--  eerstvolgende melding staat het er.
--
--  Zo blijft het hoogstens één melding per drie minuten, maar zegt elke
--  melding meer dan de vorige. Een herhaling is geen ruis; het is het
--  belangrijkste dat je kan weten.
--
--  Een reeks eindigt na een uur stilte: dan begint de telling opnieuw bij
--  nul, want dan gaat het over iets anders.
-- =====================================================================

alter table public.notification
  add column if not exists herhalingen integer not null default 0;

comment on column public.notification.herhalingen is
  'Hoe vaak er sinds de eerste vraag opnieuw gevraagd is. Nul bij een eerste melding.';


-- ---------------------------------------------------------------------
--  Eén plaats voor de twee knoppen
--
--  "Bel me eens" en "ik heb hulp nodig" verschillen alleen in tekst, niveau
--  en wachttijd. Die logica twee keer schrijven betekent dat ze later uit
--  elkaar groeit.
-- ---------------------------------------------------------------------

create or replace function public.vraag_iets(
  hh        uuid,
  sleutel   text,
  niveau    text,
  tekst     text,
  wachttijd interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vorige public.notification;
  n      integer := 0;
  body   text;
begin
  select * into vorige
    from public.notification
   where household_id = hh and dedupe_key = sleutel
   limit 1;

  -- Een reeks die al een uur stil ligt, is afgelopen.
  if found and vorige.created_at > now() - interval '1 hour' then
    n := vorige.herhalingen + 1;
  end if;

  -- Te snel na de vorige melding: de vraag telt mee, maar we sturen niet
  -- opnieuw. Zij hoort op haar scherm hoe dan ook dat het gelukt is — "je
  -- hebt net al gevraagd" helpt niemand.
  if found and vorige.created_at > now() - wachttijd then
    update public.notification set herhalingen = n where id = vorige.id;
    return;
  end if;

  body := tekst;
  if n > 0 then
    body := body || ' (' || (n + 1)::text || 'e keer)';
  end if;

  -- De oude opruimen, anders botst de unieke index op dedupe_key.
  delete from public.notification
   where household_id = hh and dedupe_key = sleutel;

  insert into public.notification (household_id, level, body, target_role, dedupe_key, herhalingen)
  values (hh, niveau, body, null, sleutel, n);
end;
$$;

revoke execute on function public.vraag_iets(uuid, text, text, text, interval) from public, authenticated;


-- ---------------------------------------------------------------------
--  1. "Bel me eens"
-- ---------------------------------------------------------------------

create or replace function public.vraag_gesprek(hh uuid)
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
    hh, 'terugbellen', 'warn',
    naam || ' vraagt of je eens belt.',
    interval '3 minutes'
  );
end;
$$;

grant execute on function public.vraag_gesprek(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  2. "Ik heb hulp nodig"
--
--  Kortere wachttijd dan bij terugbellen: dit is dringender, en twee minuten
--  stilte is al lang wanneer iemand om hulp vraagt.
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
    interval '2 minutes'
  );
end;
$$;

grant execute on function public.vraag_hulp(uuid) to authenticated;
