-- =====================================================================
--  THUIS — wie gaat er langs
--  Supabase migratie, versie 44
--
--  Draai dit wanneer het je uitkomt; het raakt geen bestaande gegevens.
--
--  Waarom
--  ------
--  De belofte van deze app is dat familie samen kan zorgen "zonder
--  voortdurend te moeten bellen". Voor de persoon is dat opgelost: die ziet
--  wie er komt. Tussen Els, Jan en Sofie onderling niet. Wie gaat er
--  donderdag langs? Wie gaat mee naar de dokter? Dat gesprek gebeurt nog
--  altijd in een groepschat, of niet.
--
--  Daarvoor ontbrak één ding in het schema: een afspraak kon wel bestaan,
--  maar niemand kon zeggen "ik doe dat". Taken hadden dat al (task.assignee);
--  agenda-items niet.
--
--  Merk op dat dit niet hetzelfde is als person_id. Dat zegt over wie het
--  gaat — "bezoek van Els" — en komt uit de kaartenbak van de persoon.
--  claimed_by zegt wie van de familie het op zich neemt, en dat is een
--  account. Bij een bezoek vallen ze vaak samen; bij een doktersafspraak
--  niet: die gaat over de persoon, en iemand anders rijdt.
-- =====================================================================

alter table public.agenda_event
  add column if not exists claimed_by uuid references public.profile (id) on delete set null;

comment on column public.agenda_event.claimed_by is
  'Welk familielid dit op zich neemt. Niet te verwarren met person_id: dat zegt over wie het gaat.';

create index if not exists agenda_claimed_idx
  on public.agenda_event (household_id, claimed_by)
  where claimed_by is not null;


-- ---------------------------------------------------------------------
--  1. Opnemen en loslaten
--
--  Alleen familie, en alleen voor zichzelf. Iemand anders inschrijven kan
--  niet: dat is precies het soort ding dat een discussie oplevert in plaats
--  van te vermijden.
-- ---------------------------------------------------------------------

create or replace function public.neem_op(gebeurtenis uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets opnemen';
  end if;

  update public.agenda_event
     set claimed_by = auth.uid()
   where id = gebeurtenis;
end;
$$;

create or replace function public.laat_los(gebeurtenis uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh  uuid;
  wie uuid;
begin
  select household_id, claimed_by into hh, wie
    from public.agenda_event where id = gebeurtenis;
  if hh is null then
    raise exception 'Die afspraak bestaat niet';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan iets loslaten';
  end if;
  -- Alleen je eigen toezegging terugnemen. Wie iets van een ander afneemt,
  -- laat die ander in de veronderstelling dat het geregeld is.
  if wie is distinct from auth.uid() then
    raise exception 'Dat heeft iemand anders opgenomen';
  end if;

  update public.agenda_event set claimed_by = null where id = gebeurtenis;
end;
$$;


-- ---------------------------------------------------------------------
--  2. "Ik ga langs"
--
--  Maakt het bezoek én neemt het meteen op. Eén handeling, want in de
--  praktijk is dat één beslissing.
--
--  Het uur is een beginwaarde, geen belofte: familie verzet het achteraf in
--  de kalender. Zonder uur kan niet — de persoon leest "Els komt om 14:00",
--  en "ergens donderdag" is voor haar geen informatie.
-- ---------------------------------------------------------------------

create or replace function public.plan_bezoek(hh uuid, dag date, uur time default '14:00')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  zone   text;
  naam   text;
  nieuw  uuid;
begin
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan een bezoek plannen';
  end if;

  select timezone into zone from public.household where id = hh;
  select coalesce(nullif(btrim(full_name), ''), 'Familie') into naam
    from public.profile where id = auth.uid();

  insert into public.agenda_event
    (household_id, starts_at, title, emoji, kind, claimed_by, created_by)
  values (
    hh,
    ((dag + uur) at time zone coalesce(zone, 'Europe/Brussels')),
    naam || ' komt langs',
    '👋',
    'visit',
    auth.uid(),
    auth.uid()
  )
  returning id into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.neem_op(uuid)                     to authenticated;
grant execute on function public.laat_los(uuid)                    to authenticated;
grant execute on function public.plan_bezoek(uuid, date, time)     to authenticated;
