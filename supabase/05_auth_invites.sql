-- =====================================================================
--  THUIS — uitnodigingen
--  Supabase migratie, versie 5
--
--  Draai dit na 01_schema.sql. 03 en 04 zijn niet vereist.
--
--  Inloggen zelf regelt Supabase Auth (magic link, geen wachtwoord).
--  Wat ontbrak was de brug tussen "iemand heeft een account" en "iemand
--  hoort bij dit huishouden". Zonder deze tabel moet je elke membership
--  met de hand in de SQL-editor zetten.
--
--  De volgorde is bewust: Els maakt een uitnodiging, Jan logt in met zijn
--  eigen mailadres, en pas daarna wisselt hij het token in. Zo kan een
--  doorgestuurde link nooit tot de verkeerde persoon leiden.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Tabel
-- ---------------------------------------------------------------------

create table if not exists public.invitation (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  email         text not null,
  role          public.member_role not null default 'member',
  relation      text,
  token         text not null unique,
  invited_by    uuid references public.profile (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references public.profile (id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists invitation_hh_idx    on public.invitation (household_id, created_at desc);
create index if not exists invitation_email_idx on public.invitation (lower(email));

comment on column public.invitation.email is
  'Het token werkt alleen voor wie met dit adres inlogt. Doorsturen heeft dus geen zin.';


-- ---------------------------------------------------------------------
--  2. RLS
--
--  Alleen de familiebeheerder ziet de uitnodigingen van haar huishouden.
--  De genodigde ziet de tabel nooit: die werkt via de functies hieronder,
--  met zijn token.
-- ---------------------------------------------------------------------

alter table public.invitation enable row level security;

drop policy if exists invitation_admin on public.invitation;
create policy invitation_admin on public.invitation for select
  using (public.family_role(household_id) = 'admin');

drop policy if exists invitation_revoke on public.invitation;
create policy invitation_revoke on public.invitation for update
  using (public.family_role(household_id) = 'admin')
  with check (public.family_role(household_id) = 'admin');


-- ---------------------------------------------------------------------
--  3. family_role(), voor het geval 03 of 04 nog niet gedraaid is
-- ---------------------------------------------------------------------

create or replace function public.family_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.membership
  where household_id = hh and profile_id = auth.uid();
$$;

grant execute on function public.family_role(uuid) to authenticated;


-- ---------------------------------------------------------------------
--  4. Uitnodigen
-- ---------------------------------------------------------------------

create or replace function public.create_invite(
  hh uuid,
  invitee_email text,
  invitee_role public.member_role default 'member',
  invitee_relation text default null)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  inv public.invitation;
begin
  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan iemand uitnodigen';
  end if;

  if invitee_email is null or position('@' in invitee_email) = 0 then
    raise exception 'Geen geldig e-mailadres';
  end if;

  -- URL-veilig: dit token belandt in een link.
  t := replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-');
  t := replace(t, '=', '');

  insert into public.invitation (household_id, email, role, relation, token, invited_by)
  values (hh, lower(trim(invitee_email)), invitee_role, invitee_relation, t, auth.uid())
  returning * into inv;

  return query select inv.id, inv.token, inv.expires_at;
end;
$$;

create or replace function public.revoke_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  select household_id into hh from public.invitation where id = invite_id;
  if hh is null then
    raise exception 'Onbekende uitnodiging';
  end if;

  if public.family_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de familiebeheerder kan een uitnodiging intrekken';
  end if;

  update public.invitation set revoked_at = now() where id = invite_id;
end;
$$;


-- ---------------------------------------------------------------------
--  5. Bekijken en aanvaarden
--
--  invite_preview toont wie je uitnodigt en voor wie, vóór je iets
--  aanvaardt. Het geeft bewust geen mailadres terug: dat hoeft de
--  genodigde niet te zien om te beslissen.
-- ---------------------------------------------------------------------

create or replace function public.invite_preview(invite_token text)
returns table (
  person_name text,
  role public.member_role,
  relation text,
  invited_by_name text,
  expires_at timestamptz,
  status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitation;
begin
  select * into inv from public.invitation where token = invite_token;
  if not found then
    raise exception 'Deze uitnodiging bestaat niet';
  end if;

  return query
  select
    h.person_name,
    inv.role,
    inv.relation,
    coalesce(p.full_name, 'Familie'),
    inv.expires_at,
    case
      when inv.revoked_at is not null then 'ingetrokken'
      when inv.accepted_at is not null then 'al gebruikt'
      when inv.expires_at < now()      then 'verlopen'
      else 'open'
    end
  from public.household h
  left join public.profile p on p.id = inv.invited_by
  where h.id = inv.household_id;
end;
$$;

create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv        public.invitation;
  mijn_email text;
begin
  if auth.uid() is null then
    raise exception 'Log eerst in met je eigen e-mailadres';
  end if;

  select * into inv from public.invitation where token = invite_token;
  if not found then
    raise exception 'Deze uitnodiging bestaat niet';
  end if;
  if inv.revoked_at is not null then
    raise exception 'Deze uitnodiging is ingetrokken';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Deze uitnodiging is al gebruikt';
  end if;
  if inv.expires_at < now() then
    raise exception 'Deze uitnodiging is verlopen. Vraag een nieuwe.';
  end if;

  select lower(email) into mijn_email from auth.users where id = auth.uid();

  -- De kern van de beveiliging: het token alleen is niet genoeg. Wie de
  -- link doorstuurt naar iemand anders, geeft daarmee geen toegang weg.
  if mijn_email is distinct from lower(inv.email) then
    raise exception 'Deze uitnodiging is voor %. Log in met dat adres.', inv.email;
  end if;

  insert into public.profile (id, full_name)
  values (auth.uid(), mijn_email)
  on conflict (id) do nothing;

  insert into public.membership (household_id, profile_id, role, invited_by)
  values (inv.household_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (household_id, profile_id) do update set role = excluded.role;

  update public.invitation
     set accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  -- Een persoonskaart, zodat de nieuwe persoon meteen bij "Wie is wie?"
  -- staat. Zonder naam blijft dat leeg en moet iemand het alsnog invullen.
  insert into public.person_card (household_id, profile_id, name, relation, kind, description)
  select inv.household_id, auth.uid(),
         split_part(mijn_email, '@', 1),
         coalesce(inv.relation, 'Familie'),
         case when inv.role = 'caregiver' then 'care' else 'family' end,
         null
  where not exists (
    select 1 from public.person_card pc
    where pc.household_id = inv.household_id and pc.profile_id = auth.uid()
  );

  insert into public.care_log (household_id, occurred_at, title, author_id, source)
  values (inv.household_id, now(),
          'Nieuw lid toegevoegd: ' || split_part(mijn_email, '@', 1),
          auth.uid(), 'family');

  return inv.household_id;
end;
$$;


-- ---------------------------------------------------------------------
--  6. Waar hoor ik bij?
--
--  Het eerste wat de app na het inloggen opvraagt. Eén rij per huishouden
--  waar deze gebruiker toegang toe heeft, met zijn rol erbij — dat bepaalt
--  of hij Maria's scherm of het familiescherm krijgt.
-- ---------------------------------------------------------------------

create or replace function public.my_households()
returns table (
  household_id uuid,
  person_name text,
  timezone text,
  role public.member_role,
  org_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.person_name, h.timezone, m.role,
         (to_jsonb(h) ->> 'org_id')::uuid
  from public.membership m
  join public.household h on h.id = m.household_id
  where m.profile_id = auth.uid()
  order by h.person_name;
$$;

grant execute on function public.create_invite(uuid, text, public.member_role, text) to authenticated;
grant execute on function public.revoke_invite(uuid)     to authenticated;
grant execute on function public.invite_preview(text)    to authenticated;
grant execute on function public.accept_invite(text)     to authenticated;
grant execute on function public.my_households()         to authenticated;


-- =====================================================================
--  In Supabase nog instellen
--
--  1. Authentication -> Providers -> Email: zet "Confirm email" aan en
--     wachtwoorden uit. Magic link volstaat.
--  2. Authentication -> URL Configuration -> Redirect URLs: voeg je
--     Netlify-adres toe, plus http://localhost:5173 voor lokaal werk.
--  3. Voor de tablet van de persoon: laat de sessie staan. Supabase
--     ververst het token vanzelf zolang de app af en toe geopend wordt.
--     Zet het toestel in kioskmodus op de app, dan hoeft ze nooit
--     opnieuw in te loggen.
--  4. De uitnodigingsmail stuur je zelf: create_invite() geeft een token
--     terug, de app maakt daar een link van. Wil je dat automatisch, dan
--     is dat een edge function op een database-webhook.
-- =====================================================================
