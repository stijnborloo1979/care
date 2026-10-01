-- Terugdraaien van 57_noodtoegang_melding.sql: beide functies zoals in 21 en 36.

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
     and n.created_at > now() - interval '2 hours'
     and m.role in ('admin', 'member')
     and (n.target_role is null or n.target_role = m.role)
     and (n.target_profile is null or n.target_profile = m.profile_id)
     -- Een taak is familiewerk en staat los van de fase: die meldingen
     -- gaan altijd door. De zorgmeldingen blijven aan "ondersteund" hangen.
     and (n.target_profile is not null or h.support_level = 'ondersteund')
   order by n.created_at
   limit limiet;
$$;

revoke execute on function public.pending_pushes(integer) from public, anon, authenticated;

create or replace function public.pending_alerts(limiet integer default 100)
returns table (
  notification_id uuid,
  profile_id      uuid,
  kind            text,
  address         text,
  level           text,
  body            text,
  person_name     text
)
language sql
security definer
set search_path = public
as $$
  with dringend as (
    select n.id, n.level, n.body, n.target_role, n.created_at, n.household_id,
           h.person_name
      from public.notification n
      join public.household h on h.id = n.household_id
     -- Alleen wat niet kan wachten. Een kanaal dat volloopt met "ontbijt
     -- afgevinkt" wordt genegeerd, en dan valt het ene bericht dat telt
     -- niet meer op.
     where n.level in ('warn', 'alert')
       -- Niets van vannacht om vier uur nog om tien uur 's ochtends sturen.
       and n.created_at > now() - interval '2 hours'
  ),
  ontvangers as (
    select d.id, d.level, d.body, d.person_name, d.created_at,
           m.profile_id, 'mail'::text as kind, u.email::text as address
      from dringend d
      join public.membership m on m.household_id = d.household_id
      join auth.users u on u.id = m.profile_id
      left join public.profile p on p.id = m.profile_id
     where m.role in ('admin', 'member')
       and (d.target_role is null or d.target_role = m.role)
       and u.email is not null
       and coalesce(p.preferences ->> 'mail_alerts', 'true') <> 'false'

    union all

    select d.id, d.level, d.body, d.person_name, d.created_at,
           m.profile_id, c.kind, c.address
      from dringend d
      join public.membership m on m.household_id = d.household_id
      join public.alert_channel c on c.profile_id = m.profile_id
                                 and c.household_id = d.household_id
     where m.role in ('admin', 'member')
       and (d.target_role is null or d.target_role = m.role)
  )
  select o.id, o.profile_id, o.kind, o.address, o.level, o.body, o.person_name
    from ontvangers o
   where not exists (
     select 1 from public.notification_delivery v
      where v.notification_id = o.id
        and v.profile_id = o.profile_id
        and v.kind = o.kind
   )
   order by o.created_at
   limit limiet;
$$;

revoke execute on function public.pending_alerts(integer) from public, anon, authenticated;
