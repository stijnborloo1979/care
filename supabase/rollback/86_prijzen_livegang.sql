-- Terugdraaien van 86_prijzen_livegang.sql: terug naar het voorstel van 77.
update public.plan set naam = 'Home',
  omschrijving = 'Alles voor thuis: medicatie, routines, Home Memory, familieportaal en analyse.',
  entitlements = array(select unnest(entitlements) except select unnest(array['voice', 'voice_transcribe', 'ask'])),
  prijs_maand_cent = 999, prijs_jaar_cent = 9900, proefdagen = 30, voorbeeld = true, volgorde = 2
where id = 'home';
update public.plan set
  omschrijving = 'Voor woonzorgcentra: zorgnotities, overdracht, team, activiteiten en beheer.',
  prijs_maand_cent = 600, minimum_maand_cent = 15000, proefdagen = 90, voorbeeld = true, volgorde = 4
where id = 'care';
update public.plan set zichtbaar = true where id in ('home_free', 'home_ai', 'care_ai');

drop function if exists public.publieke_prijzen();
create function public.publieke_prijzen()
returns table (
  id text, product text, naam text, omschrijving text, eenheid text,
  prijs_maand_cent integer, prijs_jaar_cent integer, minimum_maand_cent integer,
  btw_inbegrepen boolean, proefdagen integer, onderdelen text[], voorstel boolean
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.product, p.naam, p.omschrijving, p.eenheid,
         p.prijs_maand_cent, p.prijs_jaar_cent, p.minimum_maand_cent,
         p.btw_inbegrepen, p.proefdagen,
         array(select e.label from public.entitlement e
                where e.key = any (p.entitlements) order by e.groep, e.label),
         p.voorbeeld
    from public.plan p where p.zichtbaar order by p.volgorde, p.id;
$$;
revoke execute on function public.publieke_prijzen() from public;
grant execute on function public.publieke_prijzen() to anon, authenticated, service_role;

alter table public.plan drop column if exists prijs_op_aanvraag;
