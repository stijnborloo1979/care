-- =====================================================================
--  LIFEANGLE — prijzen bij de plannen (nog niet afgedwongen)
--  Supabase migratie, versie 77
--
--  Draai dit na 76_systeemcontrole.sql (en na 58_abonnementen.sql).
--  Terugdraaien: supabase/rollback/77_prijzen.sql
--  Tests: supabase/tests/test_77_prijzen.sql
--
--  BESTAAND   de plannen van 58 hadden een naam en wat ze ontgrendelen,
--             maar geen prijs. Er wordt nog niets afgedwongen
--             (schaduwmodus): iedereen gebruikt alles.
--  VOORGESTELD prijs per maand en per jaar, per huishouden (Home) of per
--             actieve bewoner (Care), een minimum per maand, proefdagen,
--             een korte omschrijving en of de prijs btw bevat. De bedragen
--             hieronder zijn een VOORSTEL (voorbeeld = true blijft staan):
--             aan te passen met één update, zonder nieuwe migratie.
--             publieke_prijzen() geeft de zichtbare plannen ook aan wie
--             niet ingelogd is, voor de prijspagina.
--  RISICO     geen: er wordt niets afgedwongen of aangerekend.
--
--  Prijzen aanpassen (in de SQL-editor van Supabase), bv.:
--    update public.plan set prijs_maand_cent = 1099 where id = 'home';
-- =====================================================================

do $$
begin
  if to_regclass('public.plan') is null then
    raise exception 'Draai eerst 58_abonnementen.sql';
  end if;
end
$$;

alter table public.plan add column if not exists omschrijving       text;
alter table public.plan add column if not exists eenheid            text not null default 'huishouden';
alter table public.plan add column if not exists prijs_maand_cent   integer;
alter table public.plan add column if not exists prijs_jaar_cent    integer;
alter table public.plan add column if not exists minimum_maand_cent integer;
alter table public.plan add column if not exists btw_inbegrepen     boolean not null default true;
alter table public.plan add column if not exists proefdagen         integer not null default 0;
alter table public.plan add column if not exists zichtbaar          boolean not null default true;
alter table public.plan add column if not exists volgorde           integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_prijs_check') then
    alter table public.plan add constraint plan_prijs_check check (
      eenheid in ('huishouden', 'bewoner')
      and (prijs_maand_cent is null or prijs_maand_cent >= 0)
      and (prijs_jaar_cent is null or prijs_jaar_cent >= 0)
      and (minimum_maand_cent is null or minimum_maand_cent >= 0)
      and proefdagen between 0 and 365);
  end if;
end
$$;

-- Het voorstel. Alleen invullen waar nog niets staat: wie zelf al prijzen
-- zette, verliest ze niet als dit opnieuw gedraaid wordt.
update public.plan p set
  omschrijving       = coalesce(p.omschrijving, v.omschrijving),
  eenheid            = v.eenheid,
  prijs_maand_cent   = coalesce(p.prijs_maand_cent, v.maand),
  prijs_jaar_cent    = coalesce(p.prijs_jaar_cent, v.jaar),
  minimum_maand_cent = coalesce(p.minimum_maand_cent, v.minimum),
  btw_inbegrepen     = v.btw,
  proefdagen         = case when p.proefdagen = 0 then v.proef else p.proefdagen end,
  volgorde           = v.volgorde
from (values
  ('home_free', 'De dag, berichten, familie en herinneringen. Voor altijd gratis.',               'huishouden',    0,     0, null, true,  0, 1),
  ('home',      'Alles voor thuis: medicatie, routines, Home Memory, familieportaal en analyse.', 'huishouden',  999,  9900, null, true, 30, 2),
  ('home_ai',   'Home, plus de spraakassistent die antwoordt uit jullie eigen gegevens.',         'huishouden', 1499, 14900, null, true, 30, 3),
  ('care',      'Voor woonzorgcentra: zorgnotities, overdracht, team, activiteiten en beheer.',   'bewoner',     600,  null, 15000, false, 90, 4),
  ('care_ai',   'Care, plus de spraakassistent voor bewoners en medewerkers.',                    'bewoner',     900,  null, 15000, false, 90, 5)
) as v(id, omschrijving, eenheid, maand, jaar, minimum, btw, proef, volgorde)
where p.id = v.id;

comment on column public.plan.prijs_maand_cent is
  'Prijs per maand in eurocent, per huishouden of per actieve bewoner (eenheid). Een voorstel zolang voorbeeld = true.';

create or replace function public.publieke_prijzen()
returns table (
  id text, product text, naam text, omschrijving text, eenheid text,
  prijs_maand_cent integer, prijs_jaar_cent integer, minimum_maand_cent integer,
  btw_inbegrepen boolean, proefdagen integer, onderdelen text[], voorstel boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.product, p.naam, p.omschrijving, p.eenheid,
         p.prijs_maand_cent, p.prijs_jaar_cent, p.minimum_maand_cent,
         p.btw_inbegrepen, p.proefdagen,
         array(select e.label from public.entitlement e
                where e.key = any (p.entitlements) order by e.groep, e.label),
         p.voorbeeld
    from public.plan p
   where p.zichtbaar
   order by p.volgorde, p.id;
$$;

revoke execute on function public.publieke_prijzen() from public;
grant execute on function public.publieke_prijzen() to anon, authenticated, service_role;
