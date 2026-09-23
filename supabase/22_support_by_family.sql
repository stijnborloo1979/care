-- =====================================================================
--  THUIS — de beheerder past de ondersteuning meteen toe
--  Supabase migratie, versie 22
--
--  Draai dit na 14_ownership.sql.
--
--  Tot nu vroeg meer ondersteuning het ja van de persoon, en dat ja kon
--  alleen van zijn eigen toestel komen. Werkt die tablet niet, of gebruikt
--  de persoon hem niet meer, dan zit de familie vast.
--
--  Vanaf nu past de familiebeheerder elk niveau meteen toe. Wat blijft:
--
--    - Alleen de beheerder, niet elk familielid.
--    - De persoon kan altijd zelf wijzigen, ook naar minder.
--    - Elke wijziging komt in het zorglogboek, met wie ze deed. Dat is
--      wat er overblijft van de belofte: niet dat de persoon het tegen
--      kan houden, wel dat het nooit stilletjes gebeurt.
--    - Op het scherm van de persoon blijft staan wie wat ziet.
--
--  Openstaande voorstellen worden opgeruimd: ze wachten op een antwoord
--  dat niet meer gevraagd wordt.
-- =====================================================================

update public.household
   set requested_support_level = null,
       requested_by = null,
       requested_at = null
 where requested_support_level is not null;

create or replace function public.set_support_level(hh uuid, niveau text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  huidig      text;
  ik_ben_het  boolean := public.is_self(hh);
begin
  if niveau not in ('zelf', 'samen', 'ondersteund') then
    raise exception 'Onbekend niveau';
  end if;

  if not ik_ben_het and public.auth_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de persoon zelf of de beheerder kan dit wijzigen';
  end if;

  select support_level into huidig from public.household where id = hh;
  if huidig = niveau then
    return 'toegepast';
  end if;

  update public.household
     set support_level = niveau,
         requested_support_level = null,
         requested_by = null,
         requested_at = null
   where id = hh;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Ondersteuning aangepast: ' || huidig || ' → ' || niveau, auth.uid(),
          case when ik_ben_het then 'person' else 'family' end);

  return 'toegepast';
end;
$$;

grant execute on function public.set_support_level(uuid, text) to authenticated;

comment on function public.set_support_level(uuid, text) is
  'De persoon zelf of de familiebeheerder zet het niveau, meteen. Elke wijziging komt in het zorglogboek.';

-- answer_support_request blijft bestaan zodat een oude versie van de app
-- geen fout geeft, maar er is niets meer om te beantwoorden.
