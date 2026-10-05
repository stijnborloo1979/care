-- =====================================================================
--  LIFEANGLE Care — rapporten: cijfers per periode, alleen aantallen
--  Supabase migratie, versie 83
--
--  Draai dit na 82_kamers.sql.
--  Terugdraaien: supabase/rollback/83_rapport.sql
--  Tests: supabase/tests/test_83_rapport.sql
--
--  BESTAAND   cijfers over het woonzorgcentrum waren er niet.
--  VOORGESTELD org_rapport(org, van, tot): aantallen voor een periode
--             (hoogstens een jaar): bewoners, opnames, vertrekken,
--             activiteiten, aanwezigheden, bezoeken, uitstappen en
--             nieuws. Per afdeling alleen bewoners, activiteiten en
--             aanwezigheden; de rest alleen voor het hele huis.
--  REDEN      een beheerder wil zien wat de app oplevert, zonder in te
--             kijken bij één bewoner.
--  RISICO     laag. Alleen een functie die telt.
--
--  Privacy (J4): nooit namen, nooit iets per bewoner. Bezoeken en
--  uitstappen zijn persoonlijk; die cijfers komen er alleen bij als er in de
--  gekozen periode minstens vijf bewoners waren en de periode minstens 28
--  dagen is, zodat een getal niet over één bewoner kan gaan. Hoeveel
--  families de app gebruiken, staat er bewust niet in: door voor en na een
--  opname te vergelijken, zou dat over één bewoner gaan.
--
--  Wie mag: org admin en coördinator.
-- =====================================================================

do $$
begin
  if to_regclass('public.uitstap') is null or to_regclass('public.org_nieuws') is null then
    raise exception 'Draai eerst 79_nieuws_wzc.sql en 80_uitstap.sql';
  end if;
end
$$;

create or replace function public.org_rapport(org uuid, van date, tot date)
returns table (afdeling text, sleutel text, waarde bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz constant text := 'Europe/Brussels';
  b timestamptz;
  e timestamptz;
  aantal bigint;
  in_periode bigint;
  persoonlijk boolean;
begin
  if auth.uid() is null or coalesce(public.org_role_of(org)::text, '') not in ('org_admin', 'coordinator') then
    raise exception 'Alleen de beheerder of een coördinator ziet de rapporten' using errcode = '42501';
  end if;
  if van is null or tot is null or tot < van or tot - van > 365 then
    raise exception 'Kies een periode van hoogstens een jaar' using errcode = '22023';
  end if;
  b := van::timestamp at time zone tz;
  e := (tot + 1)::timestamp at time zone tz;

  select count(*) into aantal from public.stay s where s.org_id = org and s.ended_at is null;
  -- Persoonlijke cijfers (bezoeken, uitstappen) alleen als er in die periode
  -- minstens vijf bewoners waren, en over minstens 28 dagen: zo gaat een
  -- getal nooit over één bewoner, ook niet door een korte of oude periode te
  -- kiezen.
  select count(distinct s.household_id) into in_periode from public.stay s
   where s.org_id = org and s.started_at < e and (s.ended_at is null or s.ended_at >= b);
  persoonlijk := in_periode >= 5 and tot - van >= 27;

  return query
  -- Bewoners nu, per afdeling en in totaal
  select coalesce(d.name, 'Zonder afdeling'), 'bewoners'::text, count(*)
    from public.stay s left join public.department d on d.id = s.department_id
   where s.org_id = org and s.ended_at is null
   group by d.name
  union all
  select null, 'bewoners', aantal
  union all
  select null, 'opnames', count(*) from public.stay s
   where s.org_id = org and s.started_at >= b and s.started_at < e
  union all
  select null, 'vertrekken', count(*) from public.stay s
   where s.org_id = org and s.ended_at >= b and s.ended_at < e
  -- Activiteiten en aanwezigheden
  union all
  select coalesce(d.name, 'Hele huis'), 'activiteiten', count(*)
    from public.activity a left join public.department d on d.id = a.department_id
   where a.org_id = org and a.status <> 'geannuleerd' and a.starts_at >= b and a.starts_at < e
   group by d.name
  union all
  select null, 'activiteiten', count(*) from public.activity a
   where a.org_id = org and a.status <> 'geannuleerd' and a.starts_at >= b and a.starts_at < e
  union all
  select coalesce(d.name, 'Hele huis'), 'aanwezig', count(*)
    from public.activity_participant p
    join public.activity a on a.id = p.activity_id
    left join public.department d on d.id = a.department_id
   where a.org_id = org and a.status <> 'geannuleerd' and p.status = 'aanwezig' and a.starts_at >= b and a.starts_at < e
   group by d.name
  union all
  select null, 'aanwezig', count(*)
    from public.activity_participant p join public.activity a on a.id = p.activity_id
   where a.org_id = org and a.status <> 'geannuleerd' and p.status = 'aanwezig' and a.starts_at >= b and a.starts_at < e
  union all
  select null, 'deelnemers', count(distinct p.household_id)
    from public.activity_participant p join public.activity a on a.id = p.activity_id
   where a.org_id = org and a.status <> 'geannuleerd' and p.status = 'aanwezig' and a.starts_at >= b and a.starts_at < e
  -- Persoonlijk: alleen vanaf vijf bewoners
  union all
  select null, 'bezoeken', case when persoonlijk then (
      select count(*) from public.visit_log v
       where v.visited_at >= b and v.visited_at < e
         and exists (select 1 from public.stay s where s.household_id = v.household_id and s.org_id = org
                        and s.started_at <= v.visited_at and (s.ended_at is null or s.ended_at >= v.visited_at))) end
  union all
  select null, 'uitstappen', case when persoonlijk then (
      select count(*) from public.uitstap u
       where u.status in ('weg', 'terug') and u.vertrek >= b and u.vertrek < e
         and exists (select 1 from public.stay s where s.household_id = u.household_id and s.org_id = org
                        and s.started_at <= u.vertrek and (s.ended_at is null or s.ended_at >= u.vertrek))) end
  -- Communicatie
  union all
  select null, 'nieuws', count(*) from public.org_nieuws n
   where n.org_id = org and n.created_at >= b and n.created_at < e
  ;
end;
$$;

revoke execute on function public.org_rapport(uuid, date, date) from public, anon;
grant execute on function public.org_rapport(uuid, date, date) to authenticated, service_role;
