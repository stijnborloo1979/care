-- =====================================================================
--  THUIS — "bel me eens"
--  Supabase migratie, versie 30
--
--  Draai dit na 01_schema.sql, 06_nightly_job.sql en 20_push.sql.
--
--  Bellen werkt in deze app maar één kant op: familie belt, de tablet
--  rinkelt en neemt op. Op het scherm van de persoon stond wel "Bel Els",
--  maar dat was een tel:-link — en een tablet zonder simkaart opent daarop
--  zijn eigen belfunctie, die nergens heen kan. Een knop die iets belooft
--  aan iemand die al onzeker is, is erger dan geen knop.
--
--  Dit maakt er een vraag van in plaats van een gesprek: zij drukt, familie
--  krijgt een melding, familie belt. Het gebruikt de weg die er al is
--  (notification + push), en dus ook de kant die al werkt.
--
--  Geen nieuwe tabel: dit ís een melding aan familie, net als een medicatie
--  die niet bevestigd werd.
-- =====================================================================

create or replace function public.vraag_gesprek(hh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  naam text;
  rol  public.member_role;
begin
  rol := public.auth_role(hh);
  if rol is null then
    raise exception 'Geen toegang tot dit huishouden';
  end if;

  select coalesce(h.person_name, 'Thuis') into naam
    from public.household h where h.id = hh;

  -- Tien minuten stilte tussen twee vragen.
  --
  -- Wie onzeker is, drukt nog eens. En nog eens. Twaalf meldingen maken
  -- van ongerustheid een alarm, en dan begint familie ze weg te klikken —
  -- precies de gewoonte die je nooit wil kweken. Zij krijgt intussen
  -- gewoon te horen dat het gelukt is; een "nee, je hebt net al gevraagd"
  -- helpt niemand.
  if exists (
    select 1 from public.notification
     where household_id = hh
       and dedupe_key = 'terugbellen'
       and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- De oude opruimen, anders botst de unieke index op dedupe_key.
  delete from public.notification
   where household_id = hh and dedupe_key = 'terugbellen';

  insert into public.notification (household_id, level, body, target_role, dedupe_key)
  values (hh, 'warn', naam || ' vraagt of je eens belt.', null, 'terugbellen');
end;
$$;

grant execute on function public.vraag_gesprek(uuid) to authenticated;

comment on function public.vraag_gesprek(uuid) is
  'De persoon vraagt of familie eens belt. Hoogstens één melding per tien minuten.';
