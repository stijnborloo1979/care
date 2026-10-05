-- =====================================================================
--  THUIS — my_households() herstellen
--  Supabase migratie, versie 46
--
--  Draai dit na 45_gedeeld_huis.sql.
--
--  Een tijdelijke versie nam een user_id als parameter. Die is onveilig:
--  de functie is security definer, dus iedereen kon met andermans id diens
--  huishoudens opvragen. Weg ermee; de database bepaalt zelf wie je bent.
-- =====================================================================

drop function if exists public.my_households(uuid);
drop function if exists public.my_households();

create function public.my_households()
returns table (
  household_id uuid,
  person_name text,
  timezone text,
  role public.member_role,
  org_id uuid,
  is_self boolean,
  support_level text,
  requested_support_level text,
  share_quick_notes boolean,
  home_id uuid,
  home_name text)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.person_name, h.timezone, m.role,
         (to_jsonb(h) ->> 'org_id')::uuid,
         exists (
           select 1 from public.person_card pc
           where pc.household_id = h.id and pc.kind = 'self' and pc.profile_id = auth.uid()
         ),
         h.support_level,
         h.requested_support_level,
         h.share_quick_notes,
         coalesce(h.woont_bij, h.id),
         case when h.woont_bij is null then null else thuis.person_name end
  from public.membership m
  join public.household h on h.id = m.household_id
  left join public.household thuis on thuis.id = h.woont_bij
  where m.profile_id = auth.uid()
  order by h.person_name;
$$;

revoke execute on function public.my_households() from public, anon;
grant execute on function public.my_households() to authenticated;

-- Diagnose: wie ziet de database? Gebruikt door het foutscherm in de app.
create or replace function public.debug_auth_uid()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.uid()::text, 'NULL');
$$;

grant execute on function public.debug_auth_uid() to authenticated, anon;

-- De API meteen de nieuwe functies laten zien.
notify pgrst, 'reload schema';
