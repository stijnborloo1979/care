-- =====================================================================
--  THUIS — innamegeschiedenis, schemawijzigingen en voorraad
--  Supabase migratie, versie 25
--
--  Draai dit na 01_schema.sql, 14_ownership.sql en 18_medication.sql.
--
--  Wat er al was: medication_log houdt per medicijn en per moment bij
--  wanneer er bevestigd werd (due_at, taken_at) en door wie
--  (confirmed_by). Dat werd nergens teruggelezen: de app haalt alleen de
--  momenten van vandaag op.
--
--  Wat hier bijkomt:
--
--    1. medication_change — een geschiedenis van het schema zelf.
--       medication.active was een schakelaar zonder geheugen, en
--       sync_medication_today() wist toekomstige momenten bij een
--       wijziging. Wanneer een middel startte, stopte of van dosis
--       veranderde, was dus nergens terug te vinden. Voor een verslag
--       verandert dat de betekenis van alles eromheen: een daling vanaf
--       12 augustus leest anders als er op 10 augustus een middel
--       bijkwam. Een trigger vult de tabel, niet de app: zo kan er niets
--       gemist worden, ook niet bij een wijziging via SQL.
--
--    2. Voorraad — hoeveel doses er nog in huis zijn. Elke bevestiging
--       trekt er één af. Familie ziet "nog 6 dagen" en de gaten achteraf
--       ("de doos was op") worden verklaarbaar.
--
--    3. medication_history() en medication_summary() — de geschiedenis om
--       te tonen, en de cijfers voor het verslag: bevestigd per tijdstip,
--       het aandeel dat de persoon zelf bevestigde, en over hoeveel dagen
--       die cijfers eigenlijk gaan.
--
--  BELANGRIJK, en het staat ook in de app: bevestigd is niet ingenomen.
--  Dit legt vast dat er op een knop gedrukt is. Een pillendoos met
--  sensoren weet of er een pil uit ging, dit niet. Elk cijfer hieronder
--  beschrijft bevestigingen, nooit inname.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. De geschiedenis van het schema
-- ---------------------------------------------------------------------

create table if not exists public.medication_change (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  -- Het medicijn mag verdwijnen; de wijziging blijft leesbaar. Vandaar de
  -- naam ernaast en geen harde afhankelijkheid van de rij.
  medication_id  uuid references public.medication (id) on delete set null,
  medication_name text not null,
  veld           text not null
                   check (veld in ('naam', 'dosis', 'tijden', 'instructie', 'status')),
  oud            text,
  nieuw          text,
  changed_by     uuid references public.profile (id) on delete set null,
  changed_at     timestamptz not null default now()
);

create index if not exists medication_change_hh_idx
  on public.medication_change (household_id, changed_at desc);

comment on table public.medication_change is
  'Wanneer het medicatieschema veranderde. Gevuld door een trigger, zodat niets gemist wordt.';

alter table public.medication_change enable row level security;

-- Lezen volgt medicatie zelf: wie het schema mag zien, mag zien wanneer
-- het veranderde. Schrijven doet alleen de trigger.
drop policy if exists medication_change_read on public.medication_change;
create policy medication_change_read on public.medication_change for select
  using (public.mag_meekijken(household_id));


create or replace function public.log_medication_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hh    uuid;
  naam  text;
  -- Eén rij per veld dat echt veranderde, zodat een verslag kan zeggen
  -- WAT er veranderde en niet alleen DAT er iets veranderde.
  wie   uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (old.household_id, null, old.name, 'status', 'in het schema', 'verwijderd', wie);
    return old;
  end if;

  hh   := new.household_id;
  naam := new.name;

  if tg_op = 'INSERT' then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (hh, new.id, naam, 'status', null, 'gestart', wie);
    return new;
  end if;

  -- UPDATE: alleen de velden die het schema bepalen. Een nieuwe foto of
  -- een voorraadtelling is geen schemawijziging.
  if new.name is distinct from old.name then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (hh, new.id, naam, 'naam', old.name, new.name, wie);
  end if;

  if new.dose is distinct from old.dose then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (hh, new.id, naam, 'dosis', old.dose, new.dose, wie);
  end if;

  if coalesce(new.at_times, array[new.at_time]) is distinct from
     coalesce(old.at_times, array[old.at_time]) then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (
      hh, new.id, naam, 'tijden',
      array_to_string(coalesce(old.at_times, array[old.at_time]), ', '),
      array_to_string(coalesce(new.at_times, array[new.at_time]), ', '),
      wie
    );
  end if;

  if new.instruction is distinct from old.instruction then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (hh, new.id, naam, 'instructie', old.instruction, new.instruction, wie);
  end if;

  if new.active is distinct from old.active then
    insert into public.medication_change
      (household_id, medication_id, medication_name, veld, oud, nieuw, changed_by)
    values (
      hh, new.id, naam, 'status',
      case when old.active then 'gestart' else 'gestopt' end,
      case when new.active then 'hervat' else 'gestopt' end,
      wie
    );
  end if;

  return new;
end;
$$;

drop trigger if exists medication_change_log on public.medication;
create trigger medication_change_log
  after insert or update or delete on public.medication
  for each row execute function public.log_medication_change();


-- ---------------------------------------------------------------------
--  2. Voorraad
--
--  Bewust een simpele teller en geen doosjesadministratie: hoeveel doses
--  er nog zijn, en wanneer dat laatst geteld werd. Elke bevestiging
--  trekt er één af; familie zet het getal opnieuw bij een nieuwe doos.
--  Leeg betekent: we houden geen voorraad bij voor dit medicijn.
-- ---------------------------------------------------------------------

alter table public.medication
  add column if not exists stock_doses integer,
  add column if not exists stock_updated_at timestamptz;

comment on column public.medication.stock_doses is
  'Aantal doses nog in huis. Leeg = geen voorraad bijgehouden. Elke bevestiging trekt er één af.';


create or replace function public.set_medication_stock(med uuid, doses integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.medication where id = med;
  if hh is null then
    raise exception 'Onbekend medicijn';
  end if;
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan de voorraad bijwerken';
  end if;
  if doses is not null and doses < 0 then
    raise exception 'Een voorraad kan niet negatief zijn';
  end if;

  update public.medication
     set stock_doses = doses,
         stock_updated_at = case when doses is null then null else now() end
   where id = med;
end;
$$;

grant execute on function public.set_medication_stock(uuid, integer) to authenticated;


-- confirm_medication() krijgt de voorraadtelling erbij. De rest blijft
-- exact zoals ze was: dezelfde rechten, dezelfde regel in het logboek.
create or replace function public.confirm_medication(log_id uuid, taken boolean default true)
returns public.medication_log
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.medication_log;
  m public.medication;
  r public.member_role;
  was_genomen boolean;
begin
  select * into l from public.medication_log where id = log_id;
  if not found then
    raise exception 'Onbekend medicatiemoment';
  end if;

  r := public.auth_role(l.household_id);
  if r is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  was_genomen := l.taken_at is not null;
  select * into m from public.medication where id = l.medication_id;

  update public.medication_log
     set taken_at = case when taken then now() else null end,
         confirmed_by = case when taken then auth.uid() else null end
   where id = log_id
   returning * into l;

  -- Alleen tellen als de toestand echt omslaat: twee keer bevestigen mag
  -- geen twee doses kosten, en terugzetten geeft de dose terug.
  if m.stock_doses is not null and taken is distinct from was_genomen then
    update public.medication
       set stock_doses = greatest(0, m.stock_doses + case when taken then -1 else 1 end)
     where id = m.id;
  end if;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (
    l.household_id,
    now(),
    m.name || case when taken then ' bevestigd' else ' terug opengezet' end,
    auth.uid(),
    case when r = 'person' then 'person'
         when r = 'caregiver' then 'caregiver'
         else 'family' end
  );

  return l;
end;
$$;

grant execute on function public.confirm_medication(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
--  3. De geschiedenis teruglezen
--
--  wie: de rol van wie bevestigde, binnen dít huishouden. Het verschil
--  tussen "zelf" en "familie" is de kern: blijft het totaal gelijk
--  terwijl het eigen aandeel zakt, dan neemt de afhankelijkheid toe en
--  is dat in één percentage niet te zien.
-- ---------------------------------------------------------------------

create or replace function public.medication_history(
  hh uuid,
  van date default (current_date - 30),
  tot date default current_date
)
returns table (
  log_id          uuid,
  medication_id   uuid,
  naam            text,
  dosis           text,
  due_at          timestamptz,
  taken_at        timestamptz,
  wie             text,
  wie_naam        text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ml.id,
    m.id,
    m.name,
    m.dose,
    ml.due_at,
    ml.taken_at,
    case
      when ml.taken_at is null then 'open'
      when mb.role = 'person' then 'zelf'
      when mb.role = 'caregiver' then 'zorgverlener'
      when mb.role in ('admin', 'member') then 'familie'
      else 'onbekend'
    end,
    p.full_name
  from public.medication_log ml
  join public.medication m on m.id = ml.medication_id
  left join public.profile p on p.id = ml.confirmed_by
  left join public.membership mb
         on mb.profile_id = ml.confirmed_by and mb.household_id = ml.household_id
  where ml.household_id = hh
    and public.mag_meekijken(hh)
    and ml.due_at >= (van::timestamptz)
    and ml.due_at < ((tot + 1)::timestamptz)
  order by ml.due_at desc;
$$;

grant execute on function public.medication_history(uuid, date, date) to authenticated;


-- Eén rij per tijdstip van de dag, plus een rij 'alles'. Dat is wat het
-- verslag nodig heeft: niet één percentage, maar per moment, met erbij
-- over hoeveel dagen het gaat.
create or replace function public.medication_summary(
  hh uuid,
  van date default (current_date - 30),
  tot date default current_date
)
returns table (
  tijdstip     text,
  momenten     integer,
  bevestigd    integer,
  zelf         integer,
  dagen        integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select timezone as t from public.household where id = hh
  ),
  rijen as (
    select
      to_char(ml.due_at at time zone (select t from tz), 'HH24:MI') as tijdstip,
      (ml.due_at at time zone (select t from tz))::date             as dag,
      ml.taken_at is not null                                       as genomen,
      mb.role = 'person'                                            as door_zichzelf
    from public.medication_log ml
    left join public.membership mb
           on mb.profile_id = ml.confirmed_by and mb.household_id = ml.household_id
    where ml.household_id = hh
      and public.mag_meekijken(hh)
      and ml.due_at >= (van::timestamptz)
      and ml.due_at < ((tot + 1)::timestamptz)
  )
  select
    tijdstip,
    count(*)::int,
    count(*) filter (where genomen)::int,
    count(*) filter (where genomen and door_zichzelf)::int,
    count(distinct dag)::int
  from rijen
  group by tijdstip

  union all

  select
    'alles',
    count(*)::int,
    count(*) filter (where genomen)::int,
    count(*) filter (where genomen and door_zichzelf)::int,
    count(distinct dag)::int
  from rijen

  order by 1;
$$;

grant execute on function public.medication_summary(uuid, date, date) to authenticated;
