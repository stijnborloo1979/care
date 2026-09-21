-- =====================================================================
--  THUIS — "Onthoud dit"
--  Supabase migratie, versie 13
--
--  Draai dit na 01_schema.sql.
--
--  Snelle notities die de persoon zelf maakt: "ik heb mijn sleutels in de
--  inkomhal gelegd". Bewust een eigen tabel en niet de Memory Bank: daar
--  schrijft familie in, en de persoon mag er niet in wijzigen. Hier is het
--  omgekeerd — dit is het geheugen van de persoon zelf.
--
--  Het tijdstip is de helft van de waarde. "Je zei om 10:14 dat je
--  sleutels in de inkomhal liggen" is iets waar je op kan vertrouwen;
--  "je sleutels liggen in de inkomhal" is dat niet, als het van vorige
--  week is.
-- =====================================================================

create table if not exists public.quick_note (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 500),
  created_by    uuid references public.profile (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists quick_note_hh_idx on public.quick_note (household_id, created_at desc);

alter table public.quick_note enable row level security;

drop policy if exists quick_note_read on public.quick_note;
create policy quick_note_read on public.quick_note for select
  using (public.is_member(household_id));

-- Iedereen van het huishouden mag iets onthouden, ook de persoon zelf.
drop policy if exists quick_note_insert on public.quick_note;
create policy quick_note_insert on public.quick_note for insert
  with check (
    public.auth_role(household_id) in ('admin', 'member', 'person')
    and created_by = auth.uid()
  );

-- Wissen kan wie het schreef, en de beheerder.
drop policy if exists quick_note_delete on public.quick_note;
create policy quick_note_delete on public.quick_note for delete
  using (created_by = auth.uid() or public.auth_role(household_id) = 'admin');

do $$
begin
  alter publication supabase_realtime add table public.quick_note;
exception when others then null;
end
$$;
