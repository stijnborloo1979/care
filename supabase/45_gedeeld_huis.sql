-- =====================================================================
--  THUIS — één huis, twee mensen
--  Supabase migratie, versie 45
--
--  Draai dit na 44_wie_gaat_er_langs.sql.
--
--  Waarom
--  ------
--  Twee mensen die samenwonen zijn in deze app twee huishoudens, en dat
--  blijft zo: hun medicatie, hun dagindeling en hun herinneringen mogen
--  nooit door elkaar lopen. Maar ze hebben één keuken.
--
--  Vandaag moet familie die keuken twee keer invullen. Twee keer de
--  wasmachine fotograferen, twee keer de stappen intikken, en bij elke
--  wijziging eraan denken dat het op twee plaatsen staat. Dat gaat mis, en
--  dan leest de ene persoon een uitleg die niet meer klopt.
--
--  Wat er nu gebeurt
--  -----------------
--  Een huishouden kan zeggen: ik woon bij dat andere huishouden in huis.
--  Vanaf dan is er één Home Memory voor dat huis — dezelfde kamers,
--  dezelfde apparaten, dezelfde stappen — en beide families beheren die
--  samen.
--
--  Wat níét gedeeld wordt: personen, herinneringen, foto's van het leven,
--  medicatie, agenda, zorglogboek, documenten. Alleen het huis.
--  De kaartenbak "Els = dochter" is van één persoon; de oven niet.
--
--  Bij het samenvoegen verhuist de bestaande inhoud naar het huis.
--  Kamers met dezelfde naam worden één kamer. Lege kamers en lege dingen
--  die dubbel staan — meestal restanten van de onboarding — verdwijnen;
--  alles met een foto, een stap of een bewaarplaats blijft staan, ook als
--  het dubbel is. Liever twee keer "oven" op het scherm dan één keer een
--  uitleg die iemand had ingetikt en die weg is.
-- =====================================================================

alter table public.household
  add column if not exists woont_bij uuid references public.household (id) on delete set null;

comment on column public.household.woont_bij is
  'Bij welk huishouden deze persoon in huis woont. Leeg = eigen huis. Bepaalt alleen wie de Home Memory deelt.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'household_woont_bij_niet_zichzelf'
  ) then
    alter table public.household
      add constraint household_woont_bij_niet_zichzelf check (woont_bij is distinct from id);
  end if;
end
$$;

create index if not exists household_woont_bij_idx
  on public.household (woont_bij) where woont_bij is not null;


-- ---------------------------------------------------------------------
--  1. Welk huis is dit
--
--  Eén niveau diep, met opzet: A woont bij B, en B woont nergens bij.
--  Een ketting A→B→C zou betekenen dat je niet meer kan zien welk huis je
--  aan het bewerken bent, en zet_huisgenoot hieronder laat het niet toe.
--  coalesce is dus genoeg, en dat maakt de functie één indexlookup — hij
--  wordt in elke policy aangeroepen.
-- ---------------------------------------------------------------------

create or replace function public.huis_van(hh uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(h.woont_bij, h.id) from public.household h where h.id = hh;
$$;

comment on function public.huis_van(uuid) is
  'Het huishouden waar de Home Memory van dit huishouden onder valt.';


-- Mag ik meekijken in het huis waar deze rij bij hoort?
--
-- Net als is_member kijkt dit niet naar de rol. Ook de zorgverlener hoort
-- te weten hoe de wasmachine werkt — dat is juist het soort vraag waar hij
-- voor komt — en na een samenvoeging staan die stappen onder het andere
-- huishouden. Zonder dit zou hij ze kwijt zijn.
create or replace function public.deelt_huis(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.membership m
      join public.household mijn on mijn.id = m.household_id
     where m.profile_id = auth.uid()
       and coalesce(mijn.woont_bij, mijn.id)
           = (select coalesce(h.woont_bij, h.id) from public.household h where h.id = hh)
  );
$$;

create or replace function public.mag_huis_bewerken(hh uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.membership m
      join public.household mijn on mijn.id = m.household_id
     where m.profile_id = auth.uid()
       and m.role in ('admin', 'member')
       and coalesce(mijn.woont_bij, mijn.id)
           = (select coalesce(h.woont_bij, h.id) from public.household h where h.id = hh)
  );
$$;


-- ---------------------------------------------------------------------
--  2. De policies op het huis
--
--  Alleen deze drie tabellen. memory_note en memory_photo blijven per
--  persoon: "Els = dochter" en de trouwfoto's horen bij één iemand.
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['room', 'item', 'item_step']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.deelt_huis(household_id))',
      t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all '
      'using (public.mag_huis_bewerken(household_id)) '
      'with check (public.mag_huis_bewerken(household_id))',
      t || '_write', t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------
--  3. De foto's horen bij dezelfde rijen
--
--  Paden in home-memory beginnen met een huishouden-id. Na een
--  samenvoeging staan de rijen onder het huis, maar de al geüploade
--  bestanden liggen nog onder de oude map. Beide moeten leesbaar blijven,
--  anders verdwijnt de foto van de wasmachine terwijl de stappen er nog
--  staan — het ergst mogelijke half werkende resultaat.
--
--  Alleen deze bucket. avatars, memories en documents blijven per
--  huishouden: dat zijn gezichten, het leven en papieren.
-- ---------------------------------------------------------------------

drop policy if exists "home-memory_read" on storage.objects;
create policy "home-memory_read" on storage.objects for select
  using (
    bucket_id = 'home-memory'
    and public.deelt_huis(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "home-memory_write" on storage.objects;
create policy "home-memory_write" on storage.objects for insert
  with check (
    bucket_id = 'home-memory'
    and public.mag_huis_bewerken(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "home-memory_delete" on storage.objects;
create policy "home-memory_delete" on storage.objects for delete
  using (
    bucket_id = 'home-memory'
    and public.mag_huis_bewerken(((storage.foldername(name))[1])::uuid)
  );


-- ---------------------------------------------------------------------
--  4. De app moet weten welk huis het is
--
--  home_id staat naast household_id en niet in de plaats ervan: de app
--  gebruikt household_id voor alles wat van de persoon is, en home_id
--  alleen voor Home Memory. Eén veld voor beide zou betekenen dat een
--  vergeten plek meteen medicatie van de verkeerde persoon oplevert.
--
--  home_name erbij, zodat het scherm kan zeggen wiens huis het is.
-- ---------------------------------------------------------------------

drop function if exists public.my_households();

create or replace function public.my_households()
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

grant execute on function public.my_households() to authenticated;


-- ---------------------------------------------------------------------
--  5. Samenvoegen
--
--  Beheerder van beide kanten. Wie alleen van zijn eigen huishouden
--  beheerder is, kan zich anders aan het huis van een vreemde hangen en
--  meteen in hun keuken meelezen.
-- ---------------------------------------------------------------------

create or replace function public.zet_huisgenoot(hh uuid, van uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k              record;
  bestaande      uuid;
  samengevoegd   integer := 0;
  verplaatst     integer := 0;
  dingen         integer := 0;
  weggelaten     integer := 0;
  n              integer;
begin
  -- "is distinct from" en niet "<>": wie helemaal geen lid is van dit
  -- huishouden krijgt null terug, en null <> 'admin' is null, geen waar.
  -- Met <> liep een vreemde zo langs beide controles. De test viel erover.
  if public.auth_role(hh) is distinct from 'admin' then
    raise exception 'Alleen de beheerder van dit huishouden kan dit wijzigen';
  end if;

  -- Losmaken.
  if van is null then
    update public.household set woont_bij = null where id = hh;
    return jsonb_build_object('losgemaakt', true);
  end if;

  if van = hh then
    raise exception 'Een huishouden kan niet bij zichzelf inwonen';
  end if;
  if public.auth_role(van) is distinct from 'admin' then
    raise exception 'Je moet ook beheerder zijn van het huishouden waar je bij intrekt';
  end if;
  if exists (select 1 from public.household where id = van and woont_bij is not null) then
    raise exception 'Dat huishouden woont zelf al bij iemand anders in';
  end if;
  if exists (select 1 from public.household where woont_bij = hh) then
    raise exception 'Bij dit huishouden woont al iemand in huis';
  end if;
  if exists (select 1 from public.household where id = hh and woont_bij = van) then
    return jsonb_build_object('al_gedeeld', true);
  end if;

  -- Eerst de kamers. Gelijke naam = dezelfde kamer; de keuken is de keuken.
  for k in
    select * from public.room where household_id = hh order by sort, name
  loop
    select r.id into bestaande
      from public.room r
     where r.household_id = van
       and lower(btrim(r.name)) = lower(btrim(k.name))
     limit 1;

    if bestaande is null then
      update public.room set household_id = van where id = k.id;
      verplaatst := verplaatst + 1;
    else
      -- De dingen verhuizen naar de kamer die er al was; de dubbele kamer
      -- verdwijnt. Een lege dubbele kamer laat anders een dode tegel
      -- achter op het scherm van de persoon.
      update public.item set room_id = bestaande where room_id = k.id;
      delete from public.room where id = k.id;
      samengevoegd := samengevoegd + 1;
    end if;
  end loop;

  -- Dubbele dingen zonder inhoud zijn restanten van de onboarding: één
  -- "Oven" zonder foto, zonder stap en zonder bewaarplaats naast een
  -- "Oven" die iemand heeft ingevuld. Die mag weg. Alles met inhoud
  -- blijft staan, ook dubbel: liever twee tegels dan een verdwenen uitleg.
  with leeg as (
    select i.id
      from public.item i
     where i.household_id = hh
       and coalesce(btrim(i.where_text), '') = ''
       and i.photo_path is null
       and not exists (select 1 from public.item_step s where s.item_id = i.id)
       and exists (
         select 1 from public.item b
          where b.household_id = van
            and b.room_id = i.room_id
            and lower(btrim(b.name)) = lower(btrim(i.name))
       )
  )
  delete from public.item where id in (select id from leeg);
  get diagnostics weggelaten = row_count;

  update public.item_step set household_id = van where household_id = hh;
  update public.item set household_id = van where household_id = hh;
  get diagnostics dingen = row_count;

  -- Kamers opnieuw nummeren: twee reeksen sort-waarden door elkaar geven
  -- een willekeurige volgorde op het scherm van de persoon, en juist die
  -- volgorde is waar zij op navigeert.
  n := 0;
  for k in select id from public.room where household_id = van order by sort, name loop
    update public.room set sort = n where id = k.id;
    n := n + 1;
  end loop;

  update public.household set woont_bij = van where id = hh;

  return jsonb_build_object(
    'kamers_verplaatst', verplaatst,
    'kamers_samengevoegd', samengevoegd,
    'dingen_verplaatst', dingen,
    'dubbel_weggelaten', weggelaten
  );
end;
$$;

comment on function public.zet_huisgenoot(uuid, uuid) is
  'Deel de Home Memory met een ander huishouden in hetzelfde huis, of geef null om los te maken. Bij losmaken blijft de inhoud bij het huis.';

grant execute on function public.huis_van(uuid)            to authenticated;
grant execute on function public.deelt_huis(uuid)          to authenticated;
grant execute on function public.mag_huis_bewerken(uuid)   to authenticated;
grant execute on function public.zet_huisgenoot(uuid, uuid) to authenticated;
