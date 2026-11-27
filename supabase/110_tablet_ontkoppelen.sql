-- =====================================================================
--  LIFEANGLE — de tablet ontkoppelen vanuit de familiekant
--  Supabase migratie, versie 110
--
--  Draai dit na 109_verblijf_modus.sql.
--  Terugdraaien: supabase/rollback/110_tablet_ontkoppelen.sql
--
--  BESTAAND   een tablet koppelen kon (12_pairing.sql), ontkoppelen niet.
--             Wie op de tablet de browsergegevens wiste, zag de tablet bij
--             familie gewoon blijven staan: de rij in membership bleef.
--             "Toegang weghalen" bij "Wie er bij hoort" wiste wel die rij,
--             maar liet de kaart "Dit ben jij" aan het tablet-account
--             hangen. is_self() bleef dan waar voor dat account, en
--             mag_meekijken() dus ook — zonder lidmaatschap.
--  VOORGESTELD
--             ontkoppel_tablet(hh, profiel): één handeling die
--               - het lidmaatschap 'person' weghaalt,
--               - de kaart "Dit ben jij" loskoppelt,
--               - openstaande koppelcodes laat vervallen,
--               - de aanmeldingen van dat account intrekt (waar het mag),
--               - het in het zorglogboek zet.
--             Daarbij een trigger: wordt een lidmaatschap 'person' op een
--             andere manier gewist, dan gaat de kaart toch mee los.
--  REDEN      een verloren of weggegeven tablet moet van op afstand dicht
--             kunnen, zonder Supabase-dashboard.
--  RISICO     laag. Nieuwe functie en trigger; niets bestaands verandert
--             van gedrag behalve dat de self-kaart nu mee loskomt.
--
--  Eén account voor alle toestellen van de persoon
--  -----------------------------------------------
--    pair-device hergebruikt het account 'person' van het huishouden. Twee
--    tablets zijn dus één account, en ontkoppelen meldt ze allebei af.
--    Daarna maakt een nieuwe koppelcode een nieuw account.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Wie de persoon is, hangt niet langer aan een gewist lidmaatschap
-- ---------------------------------------------------------------------

create or replace function public.person_lid_weg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'person' then
    update public.person_card
       set profile_id = null
     where household_id = old.household_id
       and kind = 'self'
       and profile_id = old.profile_id
       -- Alleen als dat account hier echt niets meer is.
       and not exists (
         select 1 from public.membership m
          where m.household_id = old.household_id and m.profile_id = old.profile_id
       );
  end if;
  return old;
end;
$$;

revoke execute on function public.person_lid_weg() from public, anon, authenticated;

drop trigger if exists membership_person_weg on public.membership;
create trigger membership_person_weg
  after delete on public.membership
  for each row execute function public.person_lid_weg();


-- ---------------------------------------------------------------------
--  2. Ontkoppelen
-- ---------------------------------------------------------------------

create or replace function public.ontkoppel_tablet(hh uuid, profiel uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ander_huis boolean;
begin
  if not public.can_legacy(hh, 'membership.manage') then
    raise exception 'Alleen de familiebeheerder kan een tablet ontkoppelen'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.membership
     where household_id = hh and profile_id = profiel and role = 'person'
  ) then
    raise exception 'Deze tablet is niet (meer) gekoppeld' using errcode = 'P0002';
  end if;

  delete from public.membership
   where household_id = hh and profile_id = profiel and role = 'person';
  -- De trigger koppelt de kaart "Dit ben jij" los.

  update public.device_pairing
     set expires_at = now()
   where household_id = hh and used_at is null and expires_at > now();

  -- Aanmeldingen intrekken. Het toegangstoken dat de tablet nog heeft,
  -- geeft zonder lidmaatschap toch niets meer (RLS), maar zo kan het ook
  -- niet ververst worden. Alleen voor een account dat nergens anders lid
  -- is. Mag de databaserol dat niet, dan gaan we gewoon verder.
  select exists (select 1 from public.membership where profile_id = profiel)
    into ander_huis;

  if not ander_huis then
    begin
      if to_regclass('auth.refresh_tokens') is not null then
        execute 'delete from auth.refresh_tokens where user_id::text = $1' using profiel::text;
      end if;
      if to_regclass('auth.sessions') is not null then
        execute 'delete from auth.sessions where user_id = $1' using profiel;
      end if;
    exception when insufficient_privilege then
      raise notice 'Aanmeldingen niet ingetrokken (geen rechten op auth): %', sqlerrm;
    end;
  end if;

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (hh, now(), 'Tablet ontkoppeld', auth.uid(), 'family');
end;
$$;

revoke execute on function public.ontkoppel_tablet(uuid, uuid) from public, anon;
grant execute on function public.ontkoppel_tablet(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
--  3. Wat al stuk was: een self-kaart aan een account zonder lidmaatschap
-- ---------------------------------------------------------------------

update public.person_card pc
   set profile_id = null
 where pc.kind = 'self'
   and pc.profile_id is not null
   and not exists (
     select 1 from public.membership m
      where m.household_id = pc.household_id and m.profile_id = pc.profile_id
   );
