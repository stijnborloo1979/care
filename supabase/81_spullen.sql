-- =====================================================================
--  LIFEANGLE Care — de spullen van de bewoner: bril, gebit, hoorapparaat
--  Supabase migratie, versie 81
--
--  Draai dit na 80_uitstap.sql.
--  Terugdraaien: supabase/rollback/81_spullen.sql
--  Tests: supabase/tests/test_81_spullen.sql
--
--  BESTAAND   kwijtgeraakte brillen, gebitten, hoorapparaten en kleding
--             kosten een afdeling veel zoektijd. Wat van wie is en hoe het
--             eruitziet, stond nergens.
--  VOORGESTELD bezitting: wat het is, een foto, een kenmerk ("naam in het
--             montuur") en waar het normaal ligt. Melden als kwijt; dan
--             staat het op de lijst "Kwijt op de afdeling" bij alle
--             zorgkundigen van die afdeling, tot iemand "gevonden" aanduidt.
--             De familie krijgt een melding als het team iets kwijt meldt.
--  REDEN      minder zoeken; de familie weet wat ontbreekt.
--  RISICO     laag. Nieuwe tabel. Foto's in de bestaande bucket memories
--             onder <huishouden>/spullen/, met de bestaande regels daarvan
--             (familie plaatst foto's, het team kan ze bekijken).
--
--  Wie mag wat
--  -----------
--    lezen        wie de agenda mag lezen (agenda.read): bewoner, familie,
--                 toegewezen zorgteam. Niet de org admin (J4).
--    toevoegen, aanpassen, wissen
--                 familie met agenda.write, of het toegewezen zorgteam
--    kwijt melden die mensen, en de bewoner zelf (meld_kwijt)
--    gevonden     die mensen, en elke zorgkundige of coördinator die nu op
--                 de afdeling van de bewoner werkt (markeer_gevonden)
--    afdeling     kwijt_op_afdeling(org): wat er kwijt is op de afdelingen
--                 waar ik werk: naam, kenmerk, waar het hoort, bewoner en
--                 kamer. Geen foto, geen andere gegevens.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.werkt_op_afdeling(uuid)') is null then
    raise exception 'Draai eerst 52_stays.sql en 70_medewerkers_beheren.sql';
  end if;
end
$$;

create table if not exists public.bezitting (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household (id) on delete cascade,
  naam           text not null check (char_length(btrim(naam)) between 1 and 80),
  soort          text not null default 'andere'
                 check (soort in ('bril', 'gebit', 'hoorapparaat', 'kleding', 'sieraad', 'hulpmiddel', 'andere')),
  kenmerk        text check (kenmerk is null or char_length(kenmerk) <= 200),
  waar           text check (waar is null or char_length(waar) <= 200),
  foto_path      text,
  kwijt_sinds    timestamptz,
  kwijt_door     uuid references public.profile (id) on delete set null,
  created_by     uuid references public.profile (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint bezitting_foto_pad check (foto_path is null or (foto_path like household_id::text || '/spullen/' || id::text || '-%' and foto_path !~ '\.\.|//'))
);
create index if not exists bezitting_hh_idx on public.bezitting (household_id);
create index if not exists bezitting_kwijt_idx on public.bezitting (household_id) where kwijt_sinds is not null;

comment on table public.bezitting is
  'De spullen van de bewoner (bril, gebit, hoorapparaat …): hoe ze eruitzien, waar ze horen, en of ze kwijt zijn.';

-- Mag ik de spullen van dit huishouden beheren?
create or replace function public.beheert_spullen(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (public.can_legacy(hh, 'agenda.write') or public.toegewezen(hh));
$$;

revoke execute on function public.beheert_spullen(uuid) from public, anon;
grant execute on function public.beheert_spullen(uuid) to authenticated, service_role;

-- Werk ik nu op de afdeling waar deze bewoner verblijft?
create or replace function public.op_afdeling_van(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stay s
     where s.household_id = hh and s.ended_at is null
       and s.department_id is not null
       and public.werkt_op_afdeling(s.department_id));
$$;

revoke execute on function public.op_afdeling_van(uuid) from public, anon;
grant execute on function public.op_afdeling_van(uuid) to authenticated, service_role;

alter table public.bezitting enable row level security;

drop policy if exists bezitting_read on public.bezitting;
create policy bezitting_read on public.bezitting for select
  using (public.can_legacy(household_id, 'agenda.read'));

drop policy if exists bezitting_insert on public.bezitting;
create policy bezitting_insert on public.bezitting for insert
  with check (created_by = auth.uid() and public.beheert_spullen(household_id));

drop policy if exists bezitting_update on public.bezitting;
create policy bezitting_update on public.bezitting for update
  using (public.beheert_spullen(household_id))
  with check (public.beheert_spullen(household_id));

drop policy if exists bezitting_delete on public.bezitting;
create policy bezitting_delete on public.bezitting for delete
  using (public.beheert_spullen(household_id));

revoke all on public.bezitting from anon;
revoke update, truncate on public.bezitting from authenticated;
grant select, insert, delete on public.bezitting to authenticated;
-- Kwijt en gevonden alleen via de functies hieronder.
grant update (naam, soort, kenmerk, waar, foto_path) on public.bezitting to authenticated;

-- Vanuit de app: niet meteen "kwijt", de servertijd, huishouden en maker liggen vast.
create or replace function public.bezitting_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_at := now();
      new.kwijt_sinds := null;
      new.kwijt_door := null;
    else
      new.household_id := old.household_id;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.bezitting_check() from public, anon, authenticated;

drop trigger if exists bezitting_check on public.bezitting;
create trigger bezitting_check before insert or update on public.bezitting
  for each row execute function public.bezitting_check();

-- Kwijt melden.
create or replace function public.meld_kwijt(bezitting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bezitting;
  naam text;
begin
  select * into b from public.bezitting where id = bezitting_id for update;
  if not found or not (public.beheert_spullen(b.household_id) or public.is_bewoner(b.household_id)) then
    raise exception 'Dit vind ik niet' using errcode = '42501';
  end if;
  if b.kwijt_sinds is not null then
    return;
  end if;
  update public.bezitting set kwijt_sinds = now(), kwijt_door = auth.uid() where id = b.id;
  -- Meldt het team iets kwijt, dan hoort de familie het. Hoogstens één
  -- keer per voorwerp per 12 uur: kwijt-gevonden-kwijt geeft geen reeks meldingen.
  if public.toegewezen(b.household_id) then
    select person_name into naam from public.household where id = b.household_id;
    if not exists (select 1 from public.notification n
                    where n.household_id = b.household_id
                      and n.created_at > now() - interval '12 hours'
                      and n.body = format('Het zorgteam zoekt %s van %s. Weet je waar het is? Laat het weten.', left(b.naam, 40), coalesce(naam, 'de bewoner'))) then
      insert into public.notification (household_id, level, body, target_role)
      values (b.household_id, 'info', format('Het zorgteam zoekt %s van %s. Weet je waar het is? Laat het weten.', left(b.naam, 40), coalesce(naam, 'de bewoner')), 'admin');
    end if;
  end if;
end;
$$;

revoke execute on function public.meld_kwijt(uuid) from public, anon;
grant execute on function public.meld_kwijt(uuid) to authenticated, service_role;

-- Gevonden: ook een collega van de afdeling die de bewoner niet toegewezen kreeg.
create or replace function public.markeer_gevonden(bezitting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bezitting;
  naam text;
begin
  select * into b from public.bezitting where id = bezitting_id for update;
  if not found or not (public.beheert_spullen(b.household_id) or public.op_afdeling_van(b.household_id)) then
    raise exception 'Dit vind ik niet' using errcode = '42501';
  end if;
  if b.kwijt_sinds is null then
    return;
  end if;
  update public.bezitting set kwijt_sinds = null, kwijt_door = null where id = b.id;
  -- Wist de familie dat het kwijt was (melding van het team), dan ook dat het terug is.
  select person_name into naam from public.household where id = b.household_id;
  if exists (select 1 from public.notification n
              where n.household_id = b.household_id
                and n.created_at >= b.kwijt_sinds
                and n.body = format('Het zorgteam zoekt %s van %s. Weet je waar het is? Laat het weten.', left(b.naam, 40), coalesce(naam, 'de bewoner')))
     and not exists (select 1 from public.notification n
                      where n.household_id = b.household_id
                        and n.created_at > now() - interval '12 hours'
                        and n.body = format('%s van %s is gevonden.', left(b.naam, 40), coalesce(naam, 'de bewoner'))) then
    insert into public.notification (household_id, level, body, target_role)
    values (b.household_id, 'ok', format('%s van %s is gevonden.', left(b.naam, 40), coalesce(naam, 'de bewoner')), 'admin');
  end if;
end;
$$;

revoke execute on function public.markeer_gevonden(uuid) from public, anon;
grant execute on function public.markeer_gevonden(uuid) to authenticated, service_role;

-- Wat is er kwijt op de afdelingen waar ik werk (of bij mijn bewoners)?
create or replace function public.kwijt_op_afdeling(org uuid)
returns table (
  id           uuid,
  household_id uuid,
  bewoner      text,
  kamer        text,
  afdeling     text,
  naam         text,
  soort        text,
  kenmerk      text,
  waar         text,
  kwijt_sinds  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.household_id, h.person_name, s.room, d.name,
         b.naam, b.soort, b.kenmerk, b.waar, b.kwijt_sinds
    from public.bezitting b
    join public.stay s on s.household_id = b.household_id and s.ended_at is null and s.org_id = org
    join public.household h on h.id = b.household_id
    left join public.department d on d.id = s.department_id
   where b.kwijt_sinds is not null
     and auth.uid() is not null
     and (public.op_afdeling_van(b.household_id) or public.toegewezen(b.household_id))
   order by b.kwijt_sinds desc
   limit 100;
$$;

revoke execute on function public.kwijt_op_afdeling(uuid) from public, anon;
grant execute on function public.kwijt_op_afdeling(uuid) to authenticated, service_role;
