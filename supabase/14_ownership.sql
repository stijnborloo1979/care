-- =====================================================================
--  THUIS — de persoon als eigenaar
--  Supabase migratie, versie 14
--
--  Draai dit na 01 tot en met 13.
--
--  Tot nu toe begon alles bij de familie: zij maakte het huishouden aan en
--  zag alles. Voor iemand met beginnende geheugenproblemen is dat precies
--  verkeerd. Deze migratie draait het om:
--
--    zelf         De persoon gebruikt de app alleen. Familie kan helpen
--                 plannen, maar ziet geen medicatie, logboek, notities of
--                 locatie. Er gaan geen meldingen naar familie.
--    samen        Familie helpt mee en kijkt mee, zonder meldingen.
--    ondersteund  Familie krijgt meldingen bij afwijkingen. Dit is hoe de
--                 app tot nu toe werkte.
--
--  Meer ondersteuning vraagt toestemming van de persoon zelf. Familie kan
--  het voorstellen; de persoon beslist. Minder ondersteuning kan altijd,
--  meteen, door de persoon.
--
--  Bestaande huishoudens krijgen 'ondersteund', zodat er niets verandert
--  aan wat er al draait.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Kolommen
-- ---------------------------------------------------------------------

alter table public.household
  add column if not exists support_level text not null default 'ondersteund'
    check (support_level in ('zelf', 'samen', 'ondersteund'));

alter table public.household add column if not exists requested_support_level text
  check (requested_support_level in ('zelf', 'samen', 'ondersteund'));
alter table public.household add column if not exists requested_by uuid
  references public.profile (id) on delete set null;
alter table public.household add column if not exists requested_at timestamptz;

alter table public.household
  add column if not exists share_quick_notes boolean not null default true;


-- ---------------------------------------------------------------------
--  2. Wie is de persoon, en wie mag meekijken?
-- ---------------------------------------------------------------------

-- De persoon is wie gekoppeld is aan de kaart "Dit ben jij". Dat geldt
-- zowel voor wie de app zelf aanmaakte als voor een gekoppelde tablet.
create or replace function public.is_self(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.person_card
    where household_id = hh and kind = 'self' and profile_id = auth.uid()
  );
$$;

create or replace function public.support_level_of(hh uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select support_level from public.household where id = hh;
$$;

-- De persoon kijkt altijd mee in zijn eigen gegevens. Anderen pas vanaf
-- "samen".
create or replace function public.mag_meekijken(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_self(hh)
      or public.auth_role(hh) = 'person'
      or (
        public.auth_role(hh) is not null
        and public.support_level_of(hh) in ('samen', 'ondersteund')
      );
$$;

grant execute on function public.is_self(uuid)          to authenticated;
grant execute on function public.support_level_of(uuid) to authenticated;
grant execute on function public.mag_meekijken(uuid)    to authenticated;


-- ---------------------------------------------------------------------
--  3. Wat familie kan zien, hangt nu af van het niveau
--
--  De agenda blijft zichtbaar: die is nodig om samen te plannen, en
--  "wanneer komt Els" werkt alleen als Els haar bezoek kan invullen.
--  Medicatie, logboek, locatie en eigen notities zijn persoonlijk.
-- ---------------------------------------------------------------------

drop policy if exists medication_log_read on public.medication_log;
create policy medication_log_read on public.medication_log for select
  using (public.mag_meekijken(household_id));

drop policy if exists care_log_read on public.care_log;
create policy care_log_read on public.care_log for select
  using (public.mag_meekijken(household_id));

do $$
begin
  if to_regclass('public.location_point') is not null then
    execute 'drop policy if exists location_point_read on public.location_point';
    execute 'create policy location_point_read on public.location_point for select
             using (public.mag_meekijken(household_id))';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.quick_note') is not null then
    execute 'drop policy if exists quick_note_read on public.quick_note';
    execute 'create policy quick_note_read on public.quick_note for select using (
               public.is_self(household_id)
               or created_by = auth.uid()
               or (
                 public.mag_meekijken(household_id)
                 and exists (
                   select 1 from public.household h
                   where h.id = household_id and h.share_quick_notes
                 )
               )
             )';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  4. Hoeveel ondersteuning
-- ---------------------------------------------------------------------

create or replace function public.set_support_level(hh uuid, niveau text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  huidig      text;
  rang_nu     integer;
  rang_nieuw  integer;
  heeft_zelf  boolean;
  ik_ben_het  boolean := public.is_self(hh);
begin
  if niveau not in ('zelf', 'samen', 'ondersteund') then
    raise exception 'Onbekend niveau';
  end if;

  if not ik_ben_het and public.auth_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de persoon zelf of de beheerder kan dit wijzigen';
  end if;

  select support_level into huidig from public.household where id = hh;
  rang_nu    := array_position(array['zelf', 'samen', 'ondersteund'], huidig);
  rang_nieuw := array_position(array['zelf', 'samen', 'ondersteund'], niveau);

  select exists (
    select 1 from public.person_card
    where household_id = hh and kind = 'self' and profile_id is not null
  ) into heeft_zelf;

  -- Meteen toepassen als: de persoon het zelf vraagt, er nog geen account
  -- van de persoon is om toestemming aan te vragen, of het om minder
  -- ondersteuning gaat. Minder toezicht vraagt nooit toestemming.
  if ik_ben_het or not heeft_zelf or rang_nieuw <= rang_nu then
    update public.household
       set support_level = niveau,
           requested_support_level = null,
           requested_by = null,
           requested_at = null
     where id = hh;

    insert into public.care_log (household_id, occurred_at, title, author_id, source)
    values (hh, now(), 'Ondersteuning aangepast: ' || niveau, auth.uid(),
            case when ik_ben_het then 'person' else 'family' end);

    return 'toegepast';
  end if;

  -- Meer ondersteuning, voorgesteld door familie: de persoon beslist.
  update public.household
     set requested_support_level = niveau,
         requested_by = auth.uid(),
         requested_at = now()
   where id = hh;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Voorstel voor meer ondersteuning: ' || niveau, auth.uid(), 'family');

  return 'aangevraagd';
end;
$$;

create or replace function public.answer_support_request(hh uuid, akkoord boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gevraagd text;
begin
  if not public.is_self(hh) then
    raise exception 'Alleen de persoon zelf kan hierop antwoorden';
  end if;

  select requested_support_level into gevraagd from public.household where id = hh;
  if gevraagd is null then
    return;
  end if;

  update public.household
     set support_level = case when akkoord then gevraagd else support_level end,
         requested_support_level = null,
         requested_by = null,
         requested_at = null
   where id = hh;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(),
          case when akkoord then 'Voorstel aanvaard: ' || gevraagd
               else 'Voorstel geweigerd: ' || gevraagd end,
          auth.uid(), 'person');
end;
$$;

create or replace function public.set_share_quick_notes(hh uuid, delen boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  heeft_zelf boolean;
begin
  select exists (
    select 1 from public.person_card
    where household_id = hh and kind = 'self' and profile_id is not null
  ) into heeft_zelf;

  -- Wat de persoon zelf liet onthouden, is van hem. Alleen als er nog
  -- geen account van de persoon is, beslist de beheerder.
  if not public.is_self(hh)
     and (heeft_zelf or public.auth_role(hh) is distinct from 'admin') then
    raise exception 'Alleen de persoon zelf kan dit wijzigen';
  end if;

  update public.household set share_quick_notes = delen where id = hh;
end;
$$;

grant execute on function public.set_support_level(uuid, text)          to authenticated;
grant execute on function public.answer_support_request(uuid, boolean)  to authenticated;
grant execute on function public.set_share_quick_notes(uuid, boolean)   to authenticated;


-- ---------------------------------------------------------------------
--  5. Meldingen alleen in de ondersteunde fase
-- ---------------------------------------------------------------------

create or replace function public.check_household_alerts(hh uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz      text;
  niveau  text;
  vandaag date;
  n       integer := 0;
  med     record;
  laat    integer;
begin
  select timezone, support_level into tz, niveau from public.household where id = hh;
  if tz is null then
    return 0;
  end if;

  -- Zelfstandig of samen: geen meldingen naar familie. Anders is het vanaf
  -- dag één een toezichtsapp, en dat is precies wat deze fase niet is.
  if niveau <> 'ondersteund' then
    return 0;
  end if;

  vandaag := (now() at time zone tz)::date;

  for med in
    select m.name, ml.due_at
    from public.medication_log ml
    join public.medication m on m.id = ml.medication_id
    where ml.household_id = hh
      and ml.taken_at is null
      and ml.due_at < now() - interval '1 hour'
      and (ml.due_at at time zone tz)::date = vandaag
  loop
    insert into public.notification (household_id, level, body, target_role, dedupe_key)
    values (hh, 'warn',
            med.name || ' van ' || to_char(med.due_at at time zone tz, 'HH24:MI') ||
            ' is nog niet bevestigd.',
            null,
            'med:' || vandaag || ':' || med.name)
    on conflict do nothing;
    n := n + 1;
  end loop;

  select count(*) into laat
  from public.agenda_event ae
  where ae.household_id = hh
    and ae.done_at is null
    and (ae.starts_at at time zone tz)::date = vandaag
    and (ae.starts_at at time zone tz)::time < time '12:00'
    and ae.starts_at < now() - interval '1 hour';

  if laat >= 3 then
    insert into public.notification (household_id, level, body, target_role, dedupe_key)
    values (hh, 'warn', 'De ochtendroutine wijkt vandaag af.', null, 'ochtend:' || vandaag)
    on conflict do nothing;
    n := n + 1;
  end if;

  return n;
end;
$$;


-- ---------------------------------------------------------------------
--  6. Een huishouden aanmaken als de persoon zelf
-- ---------------------------------------------------------------------

drop function if exists public.create_household(text, text, text);

create or replace function public.create_household(
  person_name text,
  tz text default 'Europe/Brussels',
  address text default null,
  ik_ben_de_persoon boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  insert into public.household (person_name, timezone, address, support_level)
  values (person_name, tz, address,
          case when ik_ben_de_persoon then 'zelf' else 'ondersteund' end)
  returning id into hh;

  -- Wie aanmaakt is beheerder — ook als dat de persoon zelf is. Dan beheert
  -- hij zijn eigen huishouden, en nodigt hij familie uit.
  insert into public.membership (household_id, profile_id, role)
  values (hh, auth.uid(), 'admin');

  insert into public.person_card (household_id, profile_id, name, relation, kind, description, sort)
  values (hh,
          case when ik_ben_de_persoon then auth.uid() else null end,
          person_name, 'Jij', 'self', 'Dit ben jij.', 0);

  insert into public.location_setting (household_id) values (hh)
  on conflict (household_id) do nothing;

  return hh;
end;
$$;

grant execute on function public.create_household(text, text, text, boolean) to authenticated;


-- ---------------------------------------------------------------------
--  7. my_households geeft nu ook terug of jij de persoon bent
--
--  Dat bepaalt het scherm, niet de rol. Wie de app zelf gebruikt, is ook
--  beheerder, maar hoort het scherm van de persoon te krijgen.
-- ---------------------------------------------------------------------

drop function if exists public.my_households();

create or replace function public.my_households()
returns table (
  household_id uuid,
  person_name text,
  timezone text,
  role public.member_role,
  org_id uuid,
  is_self boolean,
  support_level text,
  requested_support_level text,
  share_quick_notes boolean)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.person_name, h.timezone, m.role,
         (to_jsonb(h) ->> 'org_id')::uuid,
         exists (
           select 1 from public.person_card pc
           where pc.household_id = h.id and pc.kind = 'self' and pc.profile_id = auth.uid()
         ),
         h.support_level,
         h.requested_support_level,
         h.share_quick_notes
  from public.membership m
  join public.household h on h.id = m.household_id
  where m.profile_id = auth.uid()
  order by h.person_name;
$$;

grant execute on function public.my_households() to authenticated;
