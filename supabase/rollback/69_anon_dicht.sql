-- Terugdraaien van 69_anon_dicht.sql: het oude, open uitvoerrecht terug.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.huis_van(uuid)', 'public.support_level_of(uuid)', 'public.deelt_huis(uuid)',
    'public.is_member(uuid)', 'public.is_org_staff(uuid)', 'public.is_self(uuid)',
    'public.mag_huis_bewerken(uuid)', 'public.medication_summary(uuid, date, date)',
    'public.shares_household(uuid)']
  loop
    if to_regprocedure(f) is not null then
      execute format('grant execute on function %s to public', f);
    end if;
  end loop;
end
$$;
