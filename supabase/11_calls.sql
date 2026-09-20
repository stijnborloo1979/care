-- =====================================================================
--  THUIS — videobellen
--  Supabase migratie, versie 11
--
--  Draai dit na 01_schema.sql.
--
--  Het gesprek zelf loopt rechtstreeks van toestel naar toestel (WebRTC),
--  versleuteld, zonder tussenpartij. Deze tabel houdt alleen bij dát er
--  gebeld wordt, zodat de andere kant kan rinkelen en het logboek klopt.
--  Er wordt nooit beeld of geluid opgeslagen.
--
--  De signalering (het uitwisselen van verbindingsgegevens) loopt over
--  Supabase Realtime, niet over deze tabel: die berichten zijn vluchtig
--  en horen niet in een database.
-- =====================================================================

create table if not exists public.call (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  caller_id     uuid references public.profile (id) on delete set null,
  caller_name   text,
  status        text not null default 'ringing'
                  check (status in ('ringing', 'active', 'ended', 'missed', 'declined')),
  started_at    timestamptz not null default now(),
  answered_at   timestamptz,
  ended_at      timestamptz,
  answered_by   uuid references public.profile (id) on delete set null,
  end_reason    text
);

create index if not exists call_hh_idx on public.call (household_id, started_at desc);

alter table public.call enable row level security;

drop policy if exists call_read on public.call;
create policy call_read on public.call for select
  using (public.is_member(household_id));

-- Schrijven gaat uitsluitend via de functies hieronder: die bewaken de
-- overgangen, zodat een gesprek niet twee keer beantwoord kan worden.
drop policy if exists call_write on public.call;
create policy call_write on public.call for insert with check (false);

create or replace function public.start_call(hh uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nieuw uuid;
  naam  text;
begin
  if public.auth_role(hh) is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  -- Een oproep die al een minuut rinkelt zonder antwoord is gemist.
  -- Anders blijft een oude oproep het toestel bezet houden.
  update public.call
     set status = 'missed', ended_at = now(), end_reason = 'timeout'
   where household_id = hh
     and status = 'ringing'
     and started_at < now() - interval '60 seconds';

  select coalesce(p.full_name, 'Familie') into naam
    from public.profile p where p.id = auth.uid();

  insert into public.call (household_id, caller_id, caller_name)
  values (hh, auth.uid(), naam)
  returning id into nieuw;

  return nieuw;
end;
$$;

create or replace function public.answer_call(call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.call;
begin
  select * into c from public.call where id = call_id;
  if not found then
    raise exception 'Onbekende oproep';
  end if;
  if public.auth_role(c.household_id) is null then
    raise exception 'Geen toegang';
  end if;
  if c.status <> 'ringing' then
    return;
  end if;

  update public.call
     set status = 'active', answered_at = now(), answered_by = auth.uid()
   where id = call_id;
end;
$$;

create or replace function public.end_call(call_id uuid, reden text default 'hangup')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c             public.call;
  duur          integer;
  nieuwe_status text;
begin
  select * into c from public.call where id = call_id;
  if not found then
    return;
  end if;
  if public.auth_role(c.household_id) is null then
    raise exception 'Geen toegang';
  end if;
  if c.status in ('ended', 'missed', 'declined') then
    return;
  end if;

  nieuwe_status := case
    when c.status = 'ringing' and reden = 'declined' then 'declined'
    when c.status = 'ringing' then 'missed'
    else 'ended'
  end;

  update public.call
     set status = nieuwe_status, ended_at = now(), end_reason = reden
   where id = call_id;

  duur := case
    when c.answered_at is not null then extract(epoch from (now() - c.answered_at))::int
    else 0
  end;

  insert into public.care_log (household_id, occurred_at, title, note, author_id, source)
  values (
    c.household_id,
    now(),
    case
      when nieuwe_status = 'ended'    then 'Videogesprek met ' || coalesce(c.caller_name, 'familie')
      when nieuwe_status = 'declined' then 'Videogesprek geweigerd'
      else 'Gemiste oproep van ' || coalesce(c.caller_name, 'familie')
    end,
    case when duur > 0 then duur || ' seconden' else null end,
    auth.uid(),
    'family'
  );
end;
$$;

-- Rinkelt er nu iets? Het toestel van de persoon vraagt dit op, en krijgt
-- het ook via realtime binnen.
create or replace function public.active_call(hh uuid)
returns table (id uuid, caller_id uuid, caller_name text, status text, started_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.caller_id, c.caller_name, c.status, c.started_at
  from public.call c
  where c.household_id = hh
    and c.status in ('ringing', 'active')
    and c.started_at > now() - interval '2 minutes'
  order by c.started_at desc
  limit 1;
$$;

grant execute on function public.start_call(uuid)          to authenticated;
grant execute on function public.answer_call(uuid)         to authenticated;
grant execute on function public.end_call(uuid, text)      to authenticated;
grant execute on function public.active_call(uuid)         to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.call;
exception when others then null;
end
$$;

-- =====================================================================
--  Over de verbinding
--
--  Eén op één werkt zonder externe dienst. In ongeveer één op de vijf
--  gevallen komt de rechtstreekse verbinding niet tot stand, meestal op
--  mobiel internet waar meerdere klanten één IP-adres delen. Dan is een
--  TURN-server nodig die het beeld doorgeeft: coturn op een kleine VPS.
--
--  Zet die gegevens in Netlify als:
--    VITE_TURN_URL        turn:jouwserver.be:3478
--    VITE_TURN_USERNAME
--    VITE_TURN_CREDENTIAL
--
--  Zonder die variabelen werkt de app gewoon, maar lukt het gesprek niet
--  bij elk netwerk. De app zegt dat dan met zoveel woorden in plaats van
--  eindeloos te blijven proberen.
-- =====================================================================
