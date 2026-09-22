-- =====================================================================
--  THUIS — beluisterde berichten verdwijnen van het scherm
--  Supabase migratie, versie 19
--
--  Draai dit na 04_messages.sql.
--
--  Tot nu bleef een bericht aan de persoon twee dagen op Vandaag staan,
--  ook als het al lang beluisterd was. Nu:
--
--  - Niet beluisterd: blijft staan tot expires_at (standaard twee dagen).
--  - Beluisterd: blijft de rest van die dag staan, zodat de persoon het
--    nog eens kan afspelen ("wat zei Els weer?"). De volgende ochtend is
--    het scherm leeg. Minstens een uur na het beluisteren, zodat een
--    bericht dat om 23u50 gehoord wordt niet meteen verdwijnt.
--  - Vastgezet: blijft altijd staan, zoals voorheen.
--
--  "De dag" rekent in de tijdzone van het huishouden, niet in UTC.
--  Alleen de where-clausule verandert; de kolommen blijven dezelfde, dus
--  de app hoeft niets te weten.
-- =====================================================================

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
  ) as seen
from public.message m
join public.household h on h.id = m.household_id
where m.channel = 'person'
  and (
    m.pinned
    or (
      (m.expires_at is null or m.expires_at > now())
      and not exists (
        select 1 from public.message_read r
        where r.message_id = m.id
          and r.profile_id = auth.uid()
          and r.read_at < now() - interval '1 hour'
          and (r.read_at at time zone h.timezone)::date < (now() at time zone h.timezone)::date
      )
    )
  )
order by m.pinned desc, m.created_at desc;

grant select on public.person_inbox to authenticated;

comment on view public.person_inbox is
  'De berichten die nu op het Vandaag-scherm van de persoon horen te staan: niet beluisterd en niet verlopen, of vandaag beluisterd, of vastgezet.';
