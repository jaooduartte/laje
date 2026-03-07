DO $migration$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_edition_id\s*,\s*team_id\s*\)\s*DO\s+NOTHING',
    'ON CONFLICT ON CONSTRAINT championship_bracket_team_registrations_upsert_unique DO NOTHING',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_edition_id\s*,\s*team_id\s*,\s*sport_id\s*,\s*naipe\s*,\s*division\s*\)\s*DO\s+NOTHING',
    'ON CONFLICT ON CONSTRAINT championship_bracket_team_modalities_upsert_unique DO NOTHING',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_edition_id\s*,\s*sport_id\s*,\s*naipe\s*,\s*division\s*\)\s*DO\s+UPDATE\s+SET',
    'ON CONFLICT ON CONSTRAINT championship_bracket_competitions_upsert_unique DO UPDATE SET',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*competition_id\s*,\s*group_number\s*\)\s*DO\s+UPDATE\s+SET\s+group_number\s*=\s*EXCLUDED\.group_number',
    'ON CONFLICT ON CONSTRAINT championship_bracket_groups_upsert_unique DO UPDATE SET group_number = EXCLUDED.group_number',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*group_id\s*,\s*team_id\s*\)\s*DO\s+UPDATE\s+SET\s+position\s*=\s*EXCLUDED\.position',
    'ON CONFLICT ON CONSTRAINT championship_bracket_group_teams_upsert_unique DO UPDATE SET position = EXCLUDED.position',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_edition_id\s*,\s*event_date\s*\)\s*DO\s+UPDATE\s+SET',
    'ON CONFLICT ON CONSTRAINT championship_bracket_days_upsert_unique DO UPDATE SET',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_day_id\s*,\s*name\s*\)\s*DO\s+UPDATE\s+SET\s+position\s*=\s*EXCLUDED\.position',
    'ON CONFLICT ON CONSTRAINT championship_bracket_locations_upsert_unique DO UPDATE SET position = EXCLUDED.position',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_location_id\s*,\s*name\s*\)\s*DO\s+UPDATE\s+SET\s+position\s*=\s*EXCLUDED\.position',
    'ON CONFLICT ON CONSTRAINT championship_bracket_courts_upsert_unique DO UPDATE SET position = EXCLUDED.position',
    'gi'
  );

  function_definition := regexp_replace(
    function_definition,
    'ON\s+CONFLICT\s*\(\s*bracket_court_id\s*,\s*sport_id\s*\)\s*DO\s+NOTHING',
    'ON CONFLICT ON CONSTRAINT championship_bracket_court_sports_upsert_unique DO NOTHING',
    'gi'
  );

  IF function_definition ~* 'ON\s+CONFLICT\s*\(' THEN
    RAISE EXCEPTION 'Ainda existe ON CONFLICT por colunas na função public.generate_championship_bracket_groups(uuid, jsonb).';
  END IF;

  IF function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_team_registrations_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_team_modalities_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_competitions_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_groups_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_group_teams_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_days_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_locations_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_courts_upsert_unique'
    OR function_definition !~* 'ON\s+CONFLICT\s+ON\s+CONSTRAINT\s+championship_bracket_court_sports_upsert_unique' THEN
    RAISE EXCEPTION 'Nem todos os ON CONFLICT esperados foram convertidos para ON CONSTRAINT.';
  END IF;

  EXECUTE function_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
