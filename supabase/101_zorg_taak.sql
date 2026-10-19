-- =====================================================================
--  LIFEANGLE CARE: taken per afdeling (fase 2, onderdeel 1)
--
--  Draai na 100_overdracht_concept.sql.
--
--  Een zorgtaak hoort bij een afdeling, niet bij een gezin. Ze is niet
--  te zien voor de persoon of de familie: die gebruiken de taken uit 21.
--
--  Zien en afvinken: medewerkers van de afdeling (werkt_op_afdeling).
--  Aanmaken en verwijderen: coördinator en beheerder van de organisatie.
-- =====================================================================

create table if not exists public.zorg_taak (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisation (id) on delete cascade,
  department_id uuid not null references public.department (id) on delete cascade,
  stay_id       uuid references public.stay (id) on delete set null,
  title         text not null check (length(btrim(title)) between 1 and 200),
  note          text check (note is null or length(note) <= 2000),
  due_on        date,
  created_by    uuid references public.profile (id) on delete set null,
  created_at    timestamptz not null default now(),
  done_at       timestamptz,
  done_by       uuid references public.profile (id) on delete set null
);

create index if not exists zorg_taak_open_idx
  on public.zorg_taak (department_id, due_on)
  where done_at is null;

comment on table public.zorg_taak is
  'Taken per afdeling in de zorgomgeving. Niet zichtbaar voor de persoon of familie.';

alter table public.zorg_taak enable row level security;

-- Lezen: medewerkers van de afdeling, en coördinator/beheerder van de organisatie.
drop policy if exists zorg_taak_read on public.zorg_taak;
create policy zorg_taak_read on public.zorg_taak for select
  using (
    public.werkt_op_afdeling(department_id)
    or public.org_role_of(org_id) in ('org_admin', 'coordinator')
  );

-- Aanmaken: coördinator/beheerder, of een medewerker op de afdeling zelf.
drop policy if exists zorg_taak_insert on public.zorg_taak;
create policy zorg_taak_insert on public.zorg_taak for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.department d where d.id = department_id and d.org_id = org_id)
    and (
      public.org_role_of(org_id) in ('org_admin', 'coordinator')
      or public.werkt_op_afdeling(department_id)
    )
  );

-- Afvinken: medewerkers op de afdeling, en coördinator/beheerder.
drop policy if exists zorg_taak_update on public.zorg_taak;
create policy zorg_taak_update on public.zorg_taak for update
  using (
    public.werkt_op_afdeling(department_id)
    or public.org_role_of(org_id) in ('org_admin', 'coordinator')
  )
  with check (
    public.werkt_op_afdeling(department_id)
    or public.org_role_of(org_id) in ('org_admin', 'coordinator')
  );

-- Verwijderen: alleen coördinator/beheerder.
drop policy if exists zorg_taak_delete on public.zorg_taak;
create policy zorg_taak_delete on public.zorg_taak for delete
  using (public.org_role_of(org_id) in ('org_admin', 'coordinator'));

revoke all on public.zorg_taak from anon;
grant select, insert, update, delete on public.zorg_taak to authenticated;
