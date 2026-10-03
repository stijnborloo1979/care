-- =====================================================================
--  LIFEANGLE — niemand maakt zichzelf "de persoon" van een huishouden
--  Supabase migratie, versie 73
--
--  Draai dit na 72_afdelingen.sql. Draai 68 en 73 samen.
--  Terugdraaien: supabase/rollback/73_zelfkaart.sql
--  Tests: supabase/tests/test_73_zelfkaart.sql
--
--  BESTAAND   is_self(hh) (14) betekent: er is een persoonskaart van het
--             soort 'self' met mijn profile_id. Maar elk familielid dat
--             personen mag bewerken (people.write, 48) kon zo'n kaart zelf
--             aanmaken of een kaart naar zichzelf laten wijzen. Dan gold
--             hij als de persoon: hij zag wat alleen de persoon ziet, en
--             sinds 68 kon hij in diens naam het zorgteam berichten sturen.
--             Gevonden in de review van 68.
--  VOORGESTELD vanuit de app (rol authenticated) kan niemand nog een kaart
--             van het soort 'self' maken, een kaart in of uit dat soort
--             zetten, of de profile_id van een kaart zetten of wijzigen.
--             De server doet dat wel: bij het aanmaken van een huishouden
--             (01/14) en bij het aanvaarden van een uitnodiging (05). Naam,
--             foto en beschrijving van de eigen kaart blijven aanpasbaar.
--  RISICO     laag. De app zet profile_id en het soort 'self' nooit zelf
--             (nagekeken in src/services/people.ts en onboarding.ts).
-- =====================================================================

create or replace function public.zelfkaart_controle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.kind = 'self' or new.profile_id is not null then
      raise exception 'Deze kaart kan je niet zelf aanmaken' using errcode = '42501';
    end if;
  else
    if new.profile_id is distinct from old.profile_id
       or (new.kind = 'self') is distinct from (old.kind = 'self') then
      raise exception 'Wie deze kaart is, kan je niet aanpassen' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.zelfkaart_controle() from public, anon, authenticated;

drop trigger if exists person_card_zelf on public.person_card;
create trigger person_card_zelf
  before insert or update on public.person_card
  for each row execute function public.zelfkaart_controle();

-- Wat al misbruikt zou zijn: een tweede 'self'-kaart in een huishouden is
-- verdacht. Niet wissen (dat beslist een mens), wel melden.
do $$
declare
  n integer;
begin
  select count(*) into n from (
    select household_id from public.person_card where kind = 'self' group by household_id having count(*) > 1) x;
  if n > 0 then
    raise notice 'Let op: % huishouden(s) met meer dan één kaart van het soort self. Kijk die na.', n;
  end if;
end
$$;
