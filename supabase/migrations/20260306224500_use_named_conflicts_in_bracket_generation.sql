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

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_edition_id, team_id)\n    DO NOTHING',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_team_registrations_upsert_unique\n    DO NOTHING'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_edition_id, team_id, sport_id, naipe, division)\n      DO NOTHING',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_team_modalities_upsert_unique\n      DO NOTHING'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_edition_id, sport_id, naipe, division)\n    DO UPDATE SET',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_competitions_upsert_unique\n    DO UPDATE SET'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (competition_id, group_number)\n      DO UPDATE SET group_number = EXCLUDED.group_number',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_groups_upsert_unique\n      DO UPDATE SET group_number = EXCLUDED.group_number'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (group_id, team_id)\n        DO UPDATE SET position = EXCLUDED.position',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_group_teams_upsert_unique\n        DO UPDATE SET position = EXCLUDED.position'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_edition_id, event_date)\n    DO UPDATE SET',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_days_upsert_unique\n    DO UPDATE SET'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_day_id, name)\n      DO UPDATE SET position = EXCLUDED.position',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_locations_upsert_unique\n      DO UPDATE SET position = EXCLUDED.position'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_location_id, name)\n        DO UPDATE SET position = EXCLUDED.position',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_courts_upsert_unique\n        DO UPDATE SET position = EXCLUDED.position'
  );

  function_definition := replace(
    function_definition,
    E'ON CONFLICT (bracket_court_id, sport_id)\n          DO NOTHING',
    E'ON CONFLICT ON CONSTRAINT championship_bracket_court_sports_upsert_unique\n          DO NOTHING'
  );

  IF position('ON CONFLICT (bracket_edition_id, team_id)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_edition_id, team_id, sport_id, naipe, division)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_edition_id, sport_id, naipe, division)' IN function_definition) > 0
    OR position('ON CONFLICT (competition_id, group_number)' IN function_definition) > 0
    OR position('ON CONFLICT (group_id, team_id)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_edition_id, event_date)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_day_id, name)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_location_id, name)' IN function_definition) > 0
    OR position('ON CONFLICT (bracket_court_id, sport_id)' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'Falha ao atualizar todos os ON CONFLICT para ON CONSTRAINT na função de geração de chaveamento.';
  END IF;

  EXECUTE function_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
