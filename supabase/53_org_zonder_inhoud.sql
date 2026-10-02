-- =====================================================================
--  LIFEANGLE — een organisatie ziet geen persoonlijke inhoud meer
--  Supabase migratie, versie 53   (beslissing J4)
--
--  Draai dit na 52_stays.sql.
--  Terugdraaien: supabase/rollback/53_org_zonder_inhoud.sql
--  Tests: supabase/tests/test_53_org.sql
--
--  Wat er verandert
--  ----------------
--  Tot nu toe kregen de org admin en de coordinator van een organisatie
--  automatisch de rol 'member' bij elk gekoppeld huishouden (via
--  org_oversees() in auth_role()). Zij lazen agenda, medicatie, foto's,
--  gedeelde verhalen, notities en locatie, en konden ook wijzigen.
--
--  Vanaf nu:
--    - De organisatierol alleen geeft GEEN toegang tot inhoud meer.
--    - Org staff ziet de bewonerslijst van de eigen organisatie (naam,
--      afdeling, kamer, sinds) via org_bewoners(), en verder niets.
--    - Een medewerker met een actieve toewijzing (care_assignment) op het
--      open verblijf van een bewoner, of een team lead van de afdeling van
--      dat verblijf, krijgt de rol 'caregiver' bij die bewoner: dezelfde
--      rechten als een zorgverlener in Home.
--    - Een org admin kan zichzelf niet toewijzen.
--
--  Wat NIET verandert
--  ------------------
--  Familie, de bewoner, de tablet en zorgverleners met een gewone
--  uitnodiging (membership) houden exact dezelfde rechten. Huishoudens
--  zonder organisatie merken niets.
--
--  Hoe
--  ---
--  auth_role() en is_member() worden zo aangepast dat de org-tak vervangt
--  wordt door de toewijzing. Omdat elke policy en elke RPC via deze twee
--  functies of via can_legacy() gaat, verandert alles in één keer en
--  consequent — ook de RPC's zoals confirm_medication en voice_add_event.
-- =====================================================================

do $$
begin
  if to_regclass('public.care_assignment') is null then
    raise exception 'Draai eerst 52_stays.sql';
  end if;
end
$$;


-- ---------------------------------------------------------------------
--  1. Is ik toegewezen aan deze bewoner?
-- ---------------------------------------------------------------------

create or replace function public.toegewezen(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- een persoonlijke toewijzing op het open verblijf
    select 1
      from public.stay s
      join public.care_assignment ca on ca.stay_id = s.id
      join public.org_membership om on om.org_id = s.org_id and om.profile_id = ca.profile_id
     where s.household_id = hh
       and s.ended_at is null
       and ca.profile_id = auth.uid()
       and ca.valid_from <= now()
       and (ca.valid_until is null or ca.valid_until > now())
       and om.active
  ) or exists (
    -- team lead van de afdeling van het open verblijf
    select 1
      from public.stay s
      join public.department_staff ds on ds.department_id = s.department_id
      join public.org_membership om on om.org_id = s.org_id and om.profile_id = ds.profile_id
     where s.household_id = hh
       and s.ended_at is null
       and ds.profile_id = auth.uid()
       and ds.role = 'team_lead'
       and ds.valid_from <= now()
       and (ds.valid_until is null or ds.valid_until > now())
       and om.active
  );
$$;

revoke execute on function public.toegewezen(uuid) from public, anon;
grant execute on function public.toegewezen(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  2. auth_role() en is_member() zonder org-tak
-- ---------------------------------------------------------------------

create or replace function public.auth_role(hh uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.family_role(hh),
    case when public.toegewezen(hh) then 'caregiver'::public.member_role end
  );
$$;

create or replace function public.is_member(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membership
     where household_id = hh and profile_id = auth.uid()
  ) or public.toegewezen(hh);
$$;

-- can_legacy() kent dezelfde relaties
create or replace function public.legacy_relations(hh uuid)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text
    from public.membership m
   where m.household_id = hh and m.profile_id = auth.uid()
  union all
  select 'caregiver'
   where not exists (
           select 1 from public.membership m
            where m.household_id = hh and m.profile_id = auth.uid())
     and public.toegewezen(hh)
  union all
  select 'self'
   where public.is_self(hh);
$$;


-- ---------------------------------------------------------------------
--  3. De bewonerslijst voor de organisatie
-- ---------------------------------------------------------------------

create or replace function public.org_bewoners(org uuid)
returns table (
  household_id uuid,
  person_name  text,
  afdeling     text,
  room         text,
  sinds        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.household_id, h.person_name, d.name, s.room, s.started_at
    from public.stay s
    join public.household h on h.id = s.household_id
    left join public.department d on d.id = s.department_id
   where s.org_id = org
     and s.ended_at is null
     and public.is_org_staff(org)
   order by h.person_name;
$$;

revoke execute on function public.org_bewoners(uuid) from public, anon;
grant execute on function public.org_bewoners(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
--  4. Toewijzen: alleen medewerkers, nooit jezelf als org admin
-- ---------------------------------------------------------------------

create or replace function public.toewijzing_controle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.stay;
begin
  select * into s from public.stay where id = new.stay_id;
  if s.id is null or s.ended_at is not null then
    raise exception 'Alleen een lopend verblijf kan een toewijzing krijgen';
  end if;
  if not exists (
    select 1 from public.org_membership
     where org_id = s.org_id and profile_id = new.profile_id and active
       and role in ('coordinator', 'caregiver')
  ) then
    raise exception 'Alleen een medewerker van deze organisatie kan toegewezen worden';
  end if;
  if new.profile_id = auth.uid() then
    raise exception 'Je kan jezelf niet toewijzen';
  end if;
  return new;
end;
$$;

revoke execute on function public.toewijzing_controle() from public, anon, authenticated;

drop trigger if exists care_assignment_controle on public.care_assignment;
create trigger care_assignment_controle
  before insert or update of profile_id, stay_id on public.care_assignment
  for each row execute function public.toewijzing_controle();
