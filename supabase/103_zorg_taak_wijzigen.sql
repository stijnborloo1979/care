-- =====================================================================
--  LIFEANGLE CARE: medewerkers vinken zorgtaken alleen af (migratie 103)
--
--  Draai na 101_zorg_taak.sql.
--
--  De RLS-policy van 101 laat een medewerker op de afdeling een taak
--  bijwerken, maar niet welke kolommen. Deze trigger staat alleen
--  done_at en done_by toe voor wie geen coördinator of beheerder is.
-- =====================================================================

create or replace function public.zorg_taak_alleen_afvinken()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(public.org_role_of(new.org_id), 'caregiver') in ('org_admin', 'coordinator') then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.org_id is distinct from old.org_id
     or new.department_id is distinct from old.department_id
     or new.stay_id is distinct from old.stay_id
     or new.title is distinct from old.title
     or new.note is distinct from old.note
     or new.due_on is distinct from old.due_on
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Alleen coördinator of beheerder kan deze taak wijzigen; medewerkers vinken alleen af' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists zorg_taak_alleen_afvinken on public.zorg_taak;
create trigger zorg_taak_alleen_afvinken
  before update on public.zorg_taak
  for each row execute function public.zorg_taak_alleen_afvinken();
