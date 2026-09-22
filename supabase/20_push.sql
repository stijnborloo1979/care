-- =====================================================================
--  THUIS — pushmeldingen voor familie
--  Supabase migratie, versie 20
--
--  Draai dit na 06_nightly_job.sql en 14_ownership.sql.
--
--  De nachtjob maakt al meldingen (public.notification), maar niemand
--  ziet ze: familie moet er de app voor openen. Deze migratie zet de
--  ontvangers klaar. Het versturen zelf gebeurt in de edge function
--  `push-notify`, want een webpush moet ondertekend worden en dat kan
--  Postgres niet.
--
--  Wie krijgt een melding:
--    - alleen familie (admin en member), nooit de persoon zelf en nooit
--      een zorgverlener;
--    - alleen als het huishouden in de fase "ondersteund" staat, zoals
--      de tabel in de README belooft;
--    - alleen op toestellen waar iemand zelf toestemming gaf.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. De toestellen
--
--  Eén rij per toestel, niet per persoon: wie een gsm en een laptop
--  gebruikt, heeft twee abonnementen. Het endpoint is uniek en is
--  meteen de sleutel — dezelfde browser die opnieuw toestemt, overschrijft
--  zijn eigen rij in plaats van er een tweede te maken.
-- ---------------------------------------------------------------------

create table if not exists public.push_subscription (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profile (id) on delete cascade,
  household_id  uuid not null references public.household (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth_key      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_ok_at    timestamptz,
  failures      integer not null default 0
);

create index if not exists push_subscription_hh_idx on public.push_subscription (household_id);

comment on table public.push_subscription is
  'Eén rij per browser die toestemde. Verdwijnt zodra de browser het abonnement intrekt of het te vaak mislukt.';

alter table public.push_subscription enable row level security;

-- Je eigen toestellen beheer je zelf. Verder ziet niemand ze, ook de
-- beheerder niet: een lijst van andermans toestellen heeft geen doel.
drop policy if exists push_own on public.push_subscription;
create policy push_own on public.push_subscription for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and public.is_member(household_id));


-- ---------------------------------------------------------------------
--  2. Verstuurd of niet
--
--  Zonder dit stuurt elke draai van de functie dezelfde melding opnieuw.
-- ---------------------------------------------------------------------

alter table public.notification
  add column if not exists pushed_at timestamptz;

create index if not exists notification_push_idx
  on public.notification (pushed_at, created_at desc)
  where pushed_at is null;


-- ---------------------------------------------------------------------
--  3. Aan- en afmelden vanuit de browser
--
--  Via functies in plaats van rechtstreekse inserts, zodat het huishouden
--  en het profiel altijd uit het token komen en nooit uit de vraag.
-- ---------------------------------------------------------------------

create or replace function public.save_push_subscription(
  hh uuid, ep text, p256 text, auth_secret text, agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(hh) then
    raise exception 'Geen toegang';
  end if;

  insert into public.push_subscription
    (profile_id, household_id, endpoint, p256dh, auth_key, user_agent, last_ok_at)
  values (auth.uid(), hh, ep, p256, auth_secret, agent, now())
  on conflict (endpoint) do update
     set profile_id   = excluded.profile_id,
         household_id = excluded.household_id,
         p256dh       = excluded.p256dh,
         auth_key     = excluded.auth_key,
         user_agent   = excluded.user_agent,
         failures     = 0,
         last_ok_at   = now();
end;
$$;

create or replace function public.delete_push_subscription(ep text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscription
   where endpoint = ep and profile_id = auth.uid();
end;
$$;

grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;


-- ---------------------------------------------------------------------
--  4. Wat er verstuurd moet worden
--
--  Eén rij per melding per toestel. De edge function leest dit, stuurt,
--  en meldt daarna terug wat gelukt is.
-- ---------------------------------------------------------------------

create or replace function public.pending_pushes(limiet integer default 200)
returns table (
  notification_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  level text,
  body text,
  person_name text
)
language sql
security definer
set search_path = public
as $$
  select n.id, s.id, s.endpoint, s.p256dh, s.auth_key, n.level, n.body, h.person_name
    from public.notification n
    join public.household h on h.id = n.household_id
    join public.membership m on m.household_id = n.household_id
    join public.push_subscription s on s.profile_id = m.profile_id
                                   and s.household_id = n.household_id
   where n.pushed_at is null
     -- Niets van vannacht om vier uur nog om tien uur 's ochtends sturen.
     and n.created_at > now() - interval '2 hours'
     and h.support_level = 'ondersteund'
     and m.role in ('admin', 'member')
     and (n.target_role is null or n.target_role = m.role)
   order by n.created_at
   limit limiet;
$$;

create or replace function public.mark_pushed(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.notification set pushed_at = now()
   where id = any(ids) and pushed_at is null;
$$;

-- Een endpoint dat de browser niet meer kent (404/410) verdwijnt meteen.
create or replace function public.drop_push_subscription(sub uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscription where id = sub;
$$;

-- Alleen de service role, dus geen grant aan authenticated.
revoke execute on function public.pending_pushes(integer)      from public, authenticated;
revoke execute on function public.mark_pushed(uuid[])          from public, authenticated;
revoke execute on function public.drop_push_subscription(uuid) from public, authenticated;


-- ---------------------------------------------------------------------
--  5. Inplannen
--
--  De edge functions `push-notify` en `cleanup-storage` aanroepen vanuit
--  pg_cron, met pg_net. Vul je eigen projectadres en de service role key
--  in, en draai dit blok apart — het staat bewust niet in de migratie,
--  want een sleutel hoort niet in een bestand in de repo.
--
--    select cron.schedule('push-notify', '*/5 * * * *', $$
--      select net.http_post(
--        url     := 'https://<project>.supabase.co/functions/v1/push-notify',
--        headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
--      );
--    $$);
--
--    select cron.schedule('cleanup-storage', '40 3 * * *', $$
--      select net.http_post(
--        url     := 'https://<project>.supabase.co/functions/v1/cleanup-storage',
--        headers := '{"Authorization": "Bearer <service_role_key>"}'::jsonb
--      );
--    $$);
--
--  pg_net aanzetten via Database -> Extensions -> pg_net.
-- ---------------------------------------------------------------------
