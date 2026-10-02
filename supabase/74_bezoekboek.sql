-- =====================================================================
--  LIFEANGLE — "Wie was er hier?": het bezoekboek
--  Supabase migratie, versie 74
--
--  Draai dit na 73_zelfkaart.sql.
--  Terugdraaien: supabase/rollback/74_bezoekboek.sql
--  Tests: supabase/tests/test_74_bezoekboek.sql
--
--  BESTAAND   een bezoek bestond alleen als afspraak in de agenda. Was het
--             voorbij, dan was het weg: de persoon vergat het, voelde zich
--             alleen ("niemand komt nog langs") en belde opnieuw.
--  VOORGESTELD visit_log: wie langskwam, wanneer, één zin over wat jullie
--             deden en eventueel een foto. De persoon ziet het op de tablet
--             en de spraakassistent antwoordt ermee. Familie ziet wie er
--             deze week langskwam; het zorgteam van een WZC ook, en kan zelf
--             een bezoek vastleggen (kapster, vrijwilliger).
--  REDEN      de killerfeature "Wie was er hier?".
--  RISICO     laag. Nieuwe tabel; foto's in de bestaande bucket memories
--             onder <huishouden>/bezoek/, met de bestaande regels daarvan.
--
--  Wie mag wat
--  -----------
--    lezen        wie de agenda mag lezen (agenda.read, 48): familie, de
--                 persoon, het zorgteam (toegewezen, via can_legacy)
--    vastleggen   familie die de agenda mag aanpassen (agenda.write) en het
--                 zorgteam (toegewezen); altijd op eigen naam (author_id)
--    aanpassen    de schrijver, binnen 24 uur (foto toevoegen, tikfout)
--    wissen       de schrijver binnen 24 uur, of de familiebeheerder
--    tijd         created_at komt van de server; een bezoek ligt nooit in
--                 de toekomst en hoogstens 14 dagen terug
-- =====================================================================

do $$
begin
  if to_regprocedure('public.can_legacy(uuid, text)') is null then
    raise exception 'Draai eerst 49_can_legacy.sql';
  end if;
end
$$;

create table if not exists public.visit_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  visitor_name  text not null check (char_length(btrim(visitor_name)) between 1 and 80),
  visitor_card  uuid references public.person_card (id) on delete set null,
  note          text check (note is null or char_length(note) <= 300),
  photo_path    text,
  visited_at    timestamptz not null default now(),
  author_id     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  -- De foto hoort bij dit bezoek: <huishouden>/bezoek/<id van dit bezoek>-…
  -- Zo kan een bezoek nooit naar de foto van een ander bezoek wijzen.
  constraint visit_log_foto_pad check (photo_path is null or photo_path like household_id::text || '/bezoek/' || id::text || '-%')
);
create index if not exists visit_log_hh_idx on public.visit_log (household_id, visited_at desc);

comment on table public.visit_log is
  'Wie er op bezoek kwam. Voor de persoon die het vergeet, en voor familie die wil weten wie er langskwam.';

alter table public.visit_log enable row level security;

drop policy if exists visit_log_read on public.visit_log;
create policy visit_log_read on public.visit_log for select
  using (public.can_legacy(household_id, 'agenda.read'));

drop policy if exists visit_log_insert on public.visit_log;
create policy visit_log_insert on public.visit_log for insert
  with check (
    author_id = auth.uid()
    and (public.can_legacy(household_id, 'agenda.write') or public.toegewezen(household_id))
  );

drop policy if exists visit_log_update on public.visit_log;
create policy visit_log_update on public.visit_log for update
  using (author_id = auth.uid() and created_at > now() - interval '24 hours')
  with check (author_id = auth.uid());

drop policy if exists visit_log_delete on public.visit_log;
create policy visit_log_delete on public.visit_log for delete
  using (
    (author_id = auth.uid() and created_at > now() - interval '24 hours')
    or public.family_role(household_id) = 'admin'
  );

revoke all on public.visit_log from anon;
revoke update, truncate on public.visit_log from authenticated;
grant select, insert, delete on public.visit_log to authenticated;
grant update (visitor_name, visitor_card, note, photo_path, visited_at) on public.visit_log to authenticated;

-- De server bepaalt de tijd van schrijven en bewaakt het bezoekmoment.
create or replace function public.visit_log_tijd()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Alleen voor de app: de server (beheer, tests) mag wel bijsturen.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
      new.household_id := old.household_id;
      new.author_id := old.author_id;
    end if;
  end if;
  if new.visited_at > now() + interval '5 minutes' then
    raise exception 'Een bezoek ligt niet in de toekomst' using errcode = '22023';
  end if;
  if new.visited_at < now() - interval '14 days' then
    raise exception 'Een bezoek van meer dan 14 dagen geleden leg je niet meer vast' using errcode = '22023';
  end if;
  if new.visitor_card is not null
     and not exists (select 1 from public.person_card where id = new.visitor_card and household_id = new.household_id) then
    raise exception 'Die persoon hoort niet bij dit huishouden' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.visit_log_tijd() from public, anon, authenticated;

drop trigger if exists visit_log_tijd on public.visit_log;
create trigger visit_log_tijd before insert or update on public.visit_log
  for each row execute function public.visit_log_tijd();
