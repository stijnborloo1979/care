-- =====================================================================
--  THUIS — een bericht van het scherm halen
--  Supabase migratie, versie 29
--
--  Draai dit na 04_messages.sql.
--
--  Familie kon al verwijderen wat ze zelf stuurde (de policy op message
--  staat dat toe), maar nergens in de app stond een knop — en de
--  Berichten-pagina liet niet eens zien wát er nu op haar scherm staat.
--  Dat is app-werk; hier is alleen dit nodig:
--
--  De persoon moet een foto opzij kunnen leggen die zij niet zelf stuurde.
--  Daar heeft ze geen recht op via de policies, en dat hoort ook zo: ze
--  mag niets van familie verwijderen. Maar op háár scherm moet ze wel
--  kunnen zeggen "gezien, dank je".
--
--  Opzij leggen is dus geen verwijderen. Het zet de vervaldatum op nu, en
--  daarmee valt het bericht uit person_inbox — dezelfde weg die het na
--  twee dagen toch zou gaan. Het blijft nog zeven dagen bestaan voor
--  familie, zoals elk ander verlopen bericht. Zo kan één tik nooit iets
--  onherstelbaars doen op het scherm waar alles voorspelbaar hoort te zijn.
-- =====================================================================

create or replace function public.hide_message(msg uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
  kanaal text;
begin
  select household_id, channel into hh, kanaal
    from public.message where id = msg;

  if hh is null then
    raise exception 'Onbekend bericht';
  end if;

  -- Iedereen van het huishouden, de persoon inbegrepen. Dit is de enige
  -- handeling op een bericht die zij mag doen.
  if public.family_role(hh) is null then
    raise exception 'Geen toegang tot dit bericht';
  end if;

  -- Alleen wat op haar scherm staat. De familiedraad gaat hier niet over.
  if kanaal <> 'person' then
    raise exception 'Dit bericht staat niet op het scherm van de persoon';
  end if;

  update public.message
     set expires_at = now(),
         pinned = false
   where id = msg;
end;
$$;

grant execute on function public.hide_message(uuid) to authenticated;

comment on function public.hide_message(uuid) is
  'Haalt een bericht van het scherm van de persoon zonder het te verwijderen. Voor iedereen van het huishouden, ook de persoon zelf.';


-- ---------------------------------------------------------------------
--  Heeft de persoon het gezien?
--
--  person_inbox had één kolom "seen", en die betekent "heeft de kijker het
--  gezien" — via auth.uid(). Op het scherm van de persoon klopt dat. Maar
--  familie kijkt nu mee in dezelfde lijst, en daar zou "seen" gaan
--  betekenen: heeft Els het gezien. Dan staat er bij een foto dat Maria
--  hem bekeken heeft terwijl Els dat deed.
--
--  Dat is geen schoonheidsfoutje: familie beslist daarop om niet te
--  bellen. Dus een tweede kolom die het echt over de persoon heeft.
-- ---------------------------------------------------------------------

create or replace view public.person_inbox
with (security_invoker = true) as
select
  m.id,
  m.household_id,
  m.author_name,
  m.body,
  m.audio_path,
  m.audio_seconds,
  m.photo_path,
  m.pinned,
  m.created_at,
  exists (
    select 1 from public.message_read r
    where r.message_id = m.id and r.profile_id = auth.uid()
  ) as seen,
  exists (
    select 1
      from public.message_read r
      join public.membership mb
        on mb.profile_id = r.profile_id
       and mb.household_id = m.household_id
     where r.message_id = m.id
       and mb.role = 'person'
  ) as seen_by_person
from public.message m
where m.channel = 'person'
  and (m.pinned or m.expires_at is null or m.expires_at > now())
order by m.pinned desc, m.created_at desc;

grant select on public.person_inbox to authenticated;

comment on view public.person_inbox is
  'De berichten die nu op het Vandaag-scherm van de persoon horen te staan. seen = door de kijker gezien; seen_by_person = door de persoon zelf.';
