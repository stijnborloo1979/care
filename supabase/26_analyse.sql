-- =====================================================================
--  THUIS — analyses voor familie en voor het verslag
--  Supabase migratie, versie 26
--
--  Draai dit na 14_ownership.sql, 18_medication.sql en 25_medication_history.sql.
--
--  Dit rekent alleen met wat er al bewaard wordt. Er komt geen nieuwe
--  registratie bij: geen gelogde vragen, geen schermtijd, geen sensoren.
--
--  Drie regels die overal gelden:
--
--    - Nooit één getal zonder de spreiding of de dekking erbij. "Ontbijt
--      rond 8 uur" zegt niets; "tussen 7:40 en 9:15 in juli, tussen 6:20
--      en 11:05 in september" is het signaal. En een percentage waarvan
--      je niet weet over hoeveel dagen het gaat, kan niemand gebruiken.
--
--    - Alleen beschrijven, nooit oordelen. Deze functies geven tellingen
--      en tijdstippen terug. Geen score, geen trend, geen "achteruitgang".
--      Wat het betekent, beslist een mens.
--
--    - Alles volgt mag_meekijken(): wie de onderliggende gegevens niet
--      mag zien, ziet ook de analyse niet.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Dagritme: wanneer de dag begon, en hoe uiteenlopend
--
--  Per maand het tijdstip van de eerste afgevinkte activiteit per dag.
--  Niet het gemiddelde alleen: ook de vroegste en de laatste, want het
--  uiteenlopen is wat er toe doet. Een dag zonder afvinken telt niet mee
--  en zit in 'dagen' dus niet; dat maakt de dekking zichtbaar.
-- ---------------------------------------------------------------------

create or replace function public.analyse_dagritme(
  hh uuid,
  van date default (current_date - 90),
  tot date default current_date
)
returns table (
  maand      date,
  dagen      integer,
  vroegste   text,
  mediaan    text,
  laatste    text,
  spreiding  integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (select timezone as t from public.household where id = hh),
  per_dag as (
    select
      date_trunc('month', (ae.done_at at time zone (select t from tz)))::date as maand,
      (ae.done_at at time zone (select t from tz))::date                      as dag,
      min(extract(epoch from (ae.done_at at time zone (select t from tz))::time)) as eerste
    from public.agenda_event ae
    where ae.household_id = hh
      and public.mag_meekijken(hh)
      and ae.done_at is not null
      and ae.done_at >= (van::timestamptz)
      and ae.done_at < ((tot + 1)::timestamptz)
    group by 1, 2
  )
  select
    maand,
    count(*)::int,
    to_char((min(eerste) || ' seconds')::interval, 'HH24:MI'),
    to_char((percentile_cont(0.5) within group (order by eerste) || ' seconds')::interval, 'HH24:MI'),
    to_char((max(eerste) || ' seconds')::interval, 'HH24:MI'),
    (round((max(eerste) - min(eerste)) / 60))::int
  from per_dag
  group by maand
  order by maand;
$$;

grant execute on function public.analyse_dagritme(uuid, date, date) to authenticated;

comment on function public.analyse_dagritme(uuid, date, date) is
  'Per maand: wanneer de dag begon, met de spreiding erbij. Spreiding in minuten tussen vroegste en laatste.';


-- ---------------------------------------------------------------------
--  2. Weekpatroon
--
--  Per dag van de week: hoeveel er bevestigd en afgevinkt werd. Dit is
--  het blok dat de grootste misinterpretatie voorkomt. Klopt alles op
--  zondag omdat de dochter er dan is, dan meet je bezoek en geen
--  zelfstandigheid — en dat zie je hier meteen.
-- ---------------------------------------------------------------------

create or replace function public.analyse_weekpatroon(
  hh uuid,
  van date default (current_date - 90),
  tot date default current_date
)
returns table (
  weekdag        integer,
  med_momenten   integer,
  med_bevestigd  integer,
  med_zelf       integer,
  agenda_items   integer,
  agenda_gedaan  integer,
  dagen          integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (select timezone as t from public.household where id = hh),
  med as (
    select
      extract(isodow from (ml.due_at at time zone (select t from tz)))::int as wd,
      (ml.due_at at time zone (select t from tz))::date                     as dag,
      ml.taken_at is not null                                              as genomen,
      mb.role = 'person'                                                   as zelf
    from public.medication_log ml
    left join public.membership mb
           on mb.profile_id = ml.confirmed_by and mb.household_id = ml.household_id
    where ml.household_id = hh
      and ml.due_at >= (van::timestamptz)
      and ml.due_at < ((tot + 1)::timestamptz)
  ),
  agenda as (
    select
      extract(isodow from (ae.starts_at at time zone (select t from tz)))::int as wd,
      (ae.starts_at at time zone (select t from tz))::date                     as dag,
      ae.done_at is not null                                                   as gedaan
    from public.agenda_event ae
    where ae.household_id = hh
      and ae.starts_at >= (van::timestamptz)
      and ae.starts_at < ((tot + 1)::timestamptz)
  ),
  dagen_per_wd as (
    select wd, count(distinct dag) as n from (
      select wd, dag from med union all select wd, dag from agenda
    ) x group by wd
  )
  select
    w.wd,
    coalesce((select count(*) from med where med.wd = w.wd), 0)::int,
    coalesce((select count(*) from med where med.wd = w.wd and genomen), 0)::int,
    coalesce((select count(*) from med where med.wd = w.wd and genomen and zelf), 0)::int,
    coalesce((select count(*) from agenda where agenda.wd = w.wd), 0)::int,
    coalesce((select count(*) from agenda where agenda.wd = w.wd and gedaan), 0)::int,
    coalesce((select n from dagen_per_wd where dagen_per_wd.wd = w.wd), 0)::int
  from generate_series(1, 7) as w(wd)
  where public.mag_meekijken(hh)
  order by w.wd;
$$;

grant execute on function public.analyse_weekpatroon(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------
--  3. Wanneer de persoon actief was
--
--  Per uur van de dag: hoeveel handelingen de persoon ZELF deed. Afgeleid
--  uit de sporen die er al zijn — een afgevinkte activiteit, een
--  bevestigde medicatie, iets laten onthouden, een verhaal verteld.
--
--  Dit telt te weinig, en dat hoort erbij te staan: iemand kan wakker
--  liggen zonder het scherm aan te raken. Het is geen slaapmeting. Wat
--  het wel laat zien, is of er 's nachts iets gebeurt dat er eerder niet
--  was.
-- ---------------------------------------------------------------------

create or replace function public.analyse_activiteit(
  hh uuid,
  van date default (current_date - 90),
  tot date default current_date
)
returns table (
  uur      integer,
  aantal   integer,
  dagen    integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (select timezone as t from public.household where id = hh),
  zelf as (
    select profile_id from public.membership
     where household_id = hh and role = 'person'
  ),
  sporen as (
    select ae.done_at as moment from public.agenda_event ae
      where ae.household_id = hh and ae.done_at is not null
        and ae.done_by in (select profile_id from zelf)
    union all
    select ml.taken_at from public.medication_log ml
      where ml.household_id = hh and ml.taken_at is not null
        and ml.confirmed_by in (select profile_id from zelf)
    union all
    select qn.created_at from public.quick_note qn
      where qn.household_id = hh
        and qn.created_by in (select profile_id from zelf)
  ),
  binnen as (
    select
      extract(hour from (moment at time zone (select t from tz)))::int as uur,
      (moment at time zone (select t from tz))::date                   as dag
    from sporen
    where moment >= (van::timestamptz) and moment < ((tot + 1)::timestamptz)
  )
  select
    u.uur,
    coalesce((select count(*) from binnen where binnen.uur = u.uur), 0)::int,
    coalesce((select count(distinct dag) from binnen where binnen.uur = u.uur), 0)::int
  from generate_series(0, 23) as u(uur)
  where public.mag_meekijken(hh)
  order by u.uur;
$$;

grant execute on function public.analyse_activiteit(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------
--  4. Dekking
--
--  Over hoeveel dagen de cijfers eigenlijk gaan. Een tablet die twaalf
--  dagen uit stond, maakt elk percentage misleidend. Dit staat op het
--  verslag bij elk getal.
-- ---------------------------------------------------------------------

create or replace function public.analyse_dekking(
  hh uuid,
  van date default (current_date - 90),
  tot date default current_date
)
returns table (
  dagen_periode  integer,
  dagen_gebruik  integer,
  eerste_dag     date,
  laatste_dag    date
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (select timezone as t from public.household where id = hh),
  sporen as (
    select ae.done_at as moment from public.agenda_event ae
      where ae.household_id = hh and ae.done_at is not null
    union all
    select ml.taken_at from public.medication_log ml
      where ml.household_id = hh and ml.taken_at is not null
    union all
    select qn.created_at from public.quick_note qn where qn.household_id = hh
    union all
    select cl.occurred_at from public.care_log cl where cl.household_id = hh
  ),
  dagen as (
    select distinct (moment at time zone (select t from tz))::date as dag
    from sporen
    where moment >= (van::timestamptz) and moment < ((tot + 1)::timestamptz)
  )
  select
    (tot - van + 1)::int,
    (select count(*) from dagen)::int,
    (select min(dag) from dagen),
    (select max(dag) from dagen)
  where public.mag_meekijken(hh);
$$;

grant execute on function public.analyse_dekking(uuid, date, date) to authenticated;


-- ---------------------------------------------------------------------
--  5. Wat er op het verslag komt
--
--  De keuze hoort bewaard te worden: is het verslag elke consultatie
--  anders samengesteld, dan kan een arts niets vergelijken. Eén keer
--  kiezen, daarna standaard hetzelfde.
--
--  Op het huishouden en niet op het account: het gaat over deze persoon,
--  niet over wie toevallig inlogt. Apart van display_prefs, want dat
--  gaat over het scherm van de persoon zelf.
-- ---------------------------------------------------------------------

alter table public.household
  add column if not exists report_prefs jsonb not null default '{}'::jsonb;

comment on column public.household.report_prefs is
  'Welke blokken op het verslag voor de dokter komen, en over welke periode. Gekozen door familie.';

create or replace function public.set_report_prefs(hh uuid, prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nieuw jsonb;
begin
  -- Alleen familie: het verslag is hun voorbereiding op de consultatie.
  if public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Alleen familie kan het verslag samenstellen';
  end if;

  update public.household
     set report_prefs = coalesce(report_prefs, '{}'::jsonb) || coalesce(prefs, '{}'::jsonb)
   where id = hh
   returning report_prefs into nieuw;

  return nieuw;
end;
$$;

grant execute on function public.set_report_prefs(uuid, jsonb) to authenticated;
