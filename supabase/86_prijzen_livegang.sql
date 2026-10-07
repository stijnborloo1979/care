-- =====================================================================
--  LIFEANGLE — het aanbod bij de livegang
--  Supabase migratie, versie 86
--
--  Draai dit na 85_demo_wzc.sql (vereist 58 en 77). Draai daarna
--  76_systeemcontrole.sql opnieuw.
--  Terugdraaien: supabase/rollback/86_prijzen_livegang.sql
--  Tests: supabase/tests/test_86_prijzen_livegang.sql
--
--  BESTAAND   77 zette een VOORSTEL van vijf plannen (Home gratis, Home,
--             Home met AI, Care, Care met AI), met de melding "onder
--             voorbehoud" op de prijspagina.
--  VOORGESTELD het aanbod waarmee LifeAngle live gaat:
--             - Home: één plan, alles inbegrepen (ook de spraakassistent),
--               14 dagen gratis, daarna € 14,95 per maand of € 149 per jaar,
--               btw inbegrepen.
--             - Care (woonzorgcentrum): prijs op aanvraag. Nieuwe kolom
--               plan.prijs_op_aanvraag; de prijspagina toont dan geen bedrag.
--             - Home gratis, Home met AI en Care met AI blijven bestaan
--               (home_free is de terugval na een proefperiode in
--               entitlements_voor), maar staan niet meer op de prijspagina.
--             - voorbeeld = false voor de zichtbare plannen: de melding
--               "onder voorbehoud" verdwijnt.
--  RISICO     klein. Er wordt nog niets afgedwongen of aangerekend: een
--             huishouden zonder abonnement krijgt nog altijd alles (58).
--             Automatisch overgaan naar betalen na 14 dagen vraagt een
--             betaalprovider (Stripe); die is er nog niet.
-- =====================================================================

do $$
begin
  if to_regclass('public.plan') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'plan' and column_name = 'prijs_maand_cent') then
    raise exception 'Draai eerst 58_abonnementen.sql en 77_prijzen.sql';
  end if;
end
$$;

alter table public.plan add column if not exists prijs_op_aanvraag boolean not null default false;

comment on column public.plan.prijs_op_aanvraag is
  'Geen vaste prijs: de prijspagina toont "prijs op aanvraag" in plaats van een bedrag.';

-- Home: alles inbegrepen, ook AI.
update public.plan set
  naam              = 'Home',
  omschrijving      = 'Alles voor thuis: de dag, familie, medicatie, routines, Home Memory, documenten en de spraakassistent.',
  entitlements      = (select array(select distinct unnest(h.entitlements || ai.entitlements) order by 1)
                         from public.plan h, public.plan ai
                        where h.id = 'home' and ai.id = 'home_ai'),
  prijs_maand_cent  = 1495,
  prijs_jaar_cent   = 14900,
  btw_inbegrepen    = true,
  proefdagen        = 14,
  prijs_op_aanvraag = false,
  zichtbaar         = true,
  voorbeeld         = false,
  volgorde          = 1
where id = 'home';

-- Care: prijs op aanvraag.
update public.plan set
  naam               = 'Care',
  omschrijving       = 'Voor woonzorgcentra: zorgnotities, overdracht, team, activiteiten, kamers en beheer.',
  prijs_maand_cent   = null,
  prijs_jaar_cent    = null,
  minimum_maand_cent = null,
  proefdagen         = 0,
  prijs_op_aanvraag  = true,
  zichtbaar          = true,
  voorbeeld          = false,
  volgorde           = 2
where id = 'care';

update public.plan set zichtbaar = false where id in ('home_free', 'home_ai', 'care_ai');

-- publieke_prijzen() geeft nu ook prijs_op_aanvraag terug.
drop function if exists public.publieke_prijzen();
create function public.publieke_prijzen()
returns table (
  id text, product text, naam text, omschrijving text, eenheid text,
  prijs_maand_cent integer, prijs_jaar_cent integer, minimum_maand_cent integer,
  btw_inbegrepen boolean, proefdagen integer, onderdelen text[], voorstel boolean,
  prijs_op_aanvraag boolean
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
         p.voorbeeld,
         p.prijs_op_aanvraag
    from public.plan p
   where p.zichtbaar
   order by p.volgorde, p.id;
$$;

revoke execute on function public.publieke_prijzen() from public;
grant execute on function public.publieke_prijzen() to anon, authenticated, service_role;
