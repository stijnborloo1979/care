-- =====================================================================
--  99: zichtbaarheid van toewijzingen (care_assignment)
--
--  Na 52_stays.sql kon elke actieve medewerker van de organisatie alle
--  toewijzingen zien: wie aan welke bewoner gekoppeld is, en de reden.
--  Dat hoort niet bij "org zonder inhoud" (53): namen, afdeling en kamer
--  van alle bewoners blijven voor de hele organisatie zichtbaar, maar wie
--  een bewoner verzorgt en waarom, alleen voor coördinatoren, beheerders
--  en de betrokken medewerker zelf.
--
--  Niet gewijzigd: stay_read (naam/kamer/afdeling voor alle staff),
--  care_note (alleen toegewezen), handover (eigen afdeling).
-- =====================================================================

drop policy if exists care_assignment_read on public.care_assignment;
create policy care_assignment_read on public.care_assignment for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.stay s
       where s.id = stay_id
         and (
           public.org_role_of(s.org_id) in ('org_admin', 'coordinator')
           or public.is_self(s.household_id)
           or public.family_role(s.household_id) = 'admin'
         )
    )
  );
