-- =====================================================================
--  LIFEANGLE — can_legacy(): de huidige regels als één functie
--  Supabase migratie, versie 49
--
--  Draai dit na 48_permissions.sql.
--  Terugdraaien: supabase/rollback/49_can_legacy.sql
--  Pariteitstest: supabase/tests/test_49_parity.sql
--
--  can_legacy(hh, permissie) geeft voor elke permissie uit 48 hetzelfde
--  antwoord als de uitdrukking in de huidige policy. Ook het gedrag dat we
--  later willen veranderen (een coördinator als 'member') zit er bewust
--  in: anders is het geen pariteit, en zou het omzetten van een policy
--  stilletjes iets veranderen.
--
--  Nog steeds verandert er NIETS: geen enkele policy gebruikt can_legacy().
--  my_access(hh) is er voor de frontend (fase F1) en is alleen-lezen.
-- =====================================================================


-- Alle relaties van de ingelogde gebruiker met dit huishouden.
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
  select 'org_member'
   where not exists (
           select 1 from public.membership m
            where m.household_id = hh and m.profile_id = auth.uid())
     and public.org_oversees(hh)
  union all
  select 'self'
   where public.is_self(hh);
$$;


-- Zijn al deze categorieën gedeeld met de leden van het huishouden?
create or replace function public.consented(hh uuid, categorieen text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_and(coalesce(c.granted, false)), true)
    from unnest(categorieen) as cat(naam)
    left join public.consent c
      on c.household_id = hh and c.category = cat.naam and c.audience = 'leden';
$$;


create or replace function public.can_legacy(hh uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.legacy_relations(hh) as r(relatie)
      join public.role_permission rp
        on rp.stelsel = 'legacy'
       and rp.relation = r.relatie
       and rp.permission_key = perm
      join public.permission p on p.key = rp.permission_key
     where not rp.needs_consent
        or public.consented(hh, coalesce(rp.consent_categories, p.consent_categories))
  );
$$;


-- Voor de frontend: alle permissies die ik bij dit huishouden heb.
create or replace function public.my_access(hh uuid)
returns table (relations text[], permissions text[])
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select array_agg(distinct r) from public.legacy_relations(hh) r), '{}'),
    coalesce((select array_agg(p.key order by p.key)
                from public.permission p
               where public.can_legacy(hh, p.key)), '{}');
$$;


-- Alleen voor ingelogde gebruikers en de server.
do $$
declare f text;
begin
  foreach f in array array[
    'public.legacy_relations(uuid)',
    'public.consented(uuid, text[])',
    'public.can_legacy(uuid, text)',
    'public.my_access(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;
