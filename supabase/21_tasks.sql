-- =====================================================================
--  THUIS — taken verdelen
--  Supabase migratie, versie 21
--
--  Draai dit na 01_schema.sql en 20_push.sql.
--
--  Dit is het regelwerk van de familie, niet de dag van de persoon:
--  boodschappen, de apotheek, wie vanavond belt. Bewust iets anders dan
--  een agenda-item: een taak hangt aan een familielid, heeft hoogstens
--  een dag en geen uur, en wordt door familie afgevinkt.
--
--  De persoon ziet taken nooit. Een zorgverlener ook niet: het is
--  familiewerk, en de verdeling binnen een gezin gaat niemand anders aan.
--  Wat de persoon wél moet weten, hoort een afspraak te zijn.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. De taken
-- ---------------------------------------------------------------------

create table if not exists public.task (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 200),
  note          text,
  -- Niemand toegewezen betekent: nog op te nemen. Blijft leeg tot iemand
  -- op "neem ik" drukt, want een taak opdringen werkt in een gezin niet.
  assignee      uuid references public.profile (id) on delete set null,
  due_on        date,
  -- Terugkerend: bij het afvinken maakt de database meteen de volgende.
  repeat        text not null default 'none'
                  check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  done_at       timestamptz,
  done_by       uuid references public.profile (id) on delete set null,
  created_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Eén keer herinneren op de dag zelf, niet elke nacht opnieuw.
  reminded_on   date
);

create index if not exists task_open_idx
  on public.task (household_id, due_on)
  where done_at is null;

create index if not exists task_done_idx
  on public.task (household_id, done_at desc)
  where done_at is not null;

comment on table public.task is
  'Het regelwerk van de familie. Niet zichtbaar voor de persoon of voor zorgverleners.';

alter table public.task enable row level security;

-- Alleen admin en member. Dat sluit 'person' en 'caregiver' uit, ook al
-- zitten die in hetzelfde huishouden.
drop policy if exists task_family on public.task;
create policy task_family on public.task for all
  using (public.auth_role(household_id) in ('admin', 'member'))
  with check (public.auth_role(household_id) in ('admin', 'member'));


-- ---------------------------------------------------------------------
--  2. Meldingen aan één persoon
--
--  notification kende tot nu alleen een rol. Een taak gaat naar één
--  familielid, dus komt er een kolom bij. pending_pushes uit 20_push.sql
--  wordt hieronder opnieuw gezet zodat ze die kolom respecteert.
-- ---------------------------------------------------------------------

alter table public.notification
  add column if not exists target_profile uuid references public.profile (id) on delete cascade;

comment on column public.notification.target_profile is
  'Voor één familielid. Leeg betekent: voor iedereen met de rol in target_role.';

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

revoke execute on function public.pending_pushes(integer) from public, authenticated;


-- ---------------------------------------------------------------------
--  3. Opnemen, afvinken, toewijzen
--
--  Via functies, zodat de melding en de volgende beurt van een
--  terugkerende taak in dezelfde stap gebeuren als het afvinken zelf.
-- ---------------------------------------------------------------------

create or replace function public.claim_task(t uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.task where id = t;
  if hh is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;

  -- Alleen een taak die nog vrij is. Wie tegelijk drukt, krijgt een
  -- nette melding in plaats van andermans taak af te pakken.
  update public.task set assignee = auth.uid()
   where id = t and assignee is null and done_at is null;

  if not found then
    raise exception 'Deze taak is ondertussen al opgenomen';
  end if;
end;
$$;

create or replace function public.assign_task(t uuid, wie uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
  wat text;
  naam text;
begin
  select household_id, title into hh, wat from public.task where id = t;
  if hh is null or public.auth_role(hh) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;

  if wie is not null and not exists (
    select 1 from public.membership
     where household_id = hh and profile_id = wie and role in ('admin', 'member')
  ) then
    raise exception 'Die persoon hoort niet bij de familie van dit huishouden';
  end if;

  update public.task set assignee = wie where id = t;

  -- Zichzelf iets toewijzen hoeft geen melding.
  if wie is not null and wie <> auth.uid() then
    select coalesce(full_name, 'Iemand') into naam from public.profile where id = auth.uid();
    insert into public.notification (household_id, level, body, target_profile)
    values (hh, 'info', format('%s vroeg je: %s', naam, wat), wie);
  end if;
end;
$$;

create or replace function public.complete_task(t uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.task;
  volgende date;
  nieuw uuid;
begin
  select * into r from public.task where id = t;
  if r.id is null or public.auth_role(r.household_id) not in ('admin', 'member') then
    raise exception 'Geen toegang';
  end if;
  if r.done_at is not null then
    return null;
  end if;

  update public.task
     set done_at = now(), done_by = auth.uid()
   where id = t;

  if r.repeat = 'none' then
    return null;
  end if;

  -- Terugkerend: vanaf de vervaldag tellen, niet vanaf vandaag. Wie de
  -- boodschappen twee dagen te laat doet, blijft op zijn vaste dag zitten.
  volgende := (coalesce(r.due_on, current_date) + case r.repeat
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    else interval '1 month'
  end)::date;

  insert into public.task (household_id, title, note, assignee, due_on, repeat, created_by)
  values (r.household_id, r.title, r.note, r.assignee, volgende, r.repeat, r.created_by)
  returning id into nieuw;

  return nieuw;
end;
$$;

create or replace function public.reopen_task(t uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.task
     where id = t and public.auth_role(household_id) in ('admin', 'member')
  ) then
    raise exception 'Geen toegang';
  end if;

  update public.task set done_at = null, done_by = null where id = t;
end;
$$;

grant execute on function public.claim_task(uuid)    to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
grant execute on function public.reopen_task(uuid)   to authenticated;


-- ---------------------------------------------------------------------
--  4. Herinneren op de dag zelf
--
--  Eén melding 's ochtends, alleen aan wie de taak op zich nam. Een
--  taak die niemand opnam, herinnert niemand: die hoort op het scherm
--  te blijven staan tot iemand ze neemt.
--
--  Plan in via pg_cron, bijvoorbeeld om 07:00:
--    select cron.schedule('taken-herinneren', '0 7 * * *',
--                         $$select public.task_reminders();$$);
-- ---------------------------------------------------------------------

create or replace function public.task_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  aantal integer := 0;
begin
  with te_doen as (
    select t.id, t.household_id, t.title, t.assignee, t.due_on
      from public.task t
     where t.done_at is null
       and t.assignee is not null
       and t.due_on is not null
       and t.due_on <= current_date
       and (t.reminded_on is null or t.reminded_on < current_date)
  ), gestuurd as (
    insert into public.notification (household_id, level, body, target_profile)
    select household_id,
           case when due_on < current_date then 'warn' else 'info' end,
           case when due_on < current_date
                then format('Nog te doen: %s', title)
                else format('Vandaag: %s', title)
           end,
           assignee
      from te_doen
    returning 1
  )
  update public.task set reminded_on = current_date
   where id in (select id from te_doen);

  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

revoke execute on function public.task_reminders() from public, authenticated;
