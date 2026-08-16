DO $migration_reverse_day_court_match_order_preview$
DECLARE
  function_definition TEXT;
  updated_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.preview_championship_bracket_reconfiguration(uuid,text,jsonb)'::regprocedure)
  INTO function_definition;

  updated_function_definition := replace(
    function_definition,
    $old_snapshot$
    'manual_representation_mode', matches_table.manual_representation_mode
  ))
$old_snapshot$,
    $new_snapshot$
    'manual_representation_mode', matches_table.manual_representation_mode,
    'sport_name', sports_table.name,
    'naipe', matches_table.naipe,
    'home_team_name', home_teams_table.name,
    'away_team_name', away_teams_table.name
  ))
$new_snapshot$
  );

  updated_function_definition := replace(
    updated_function_definition,
    $old_snapshot_joins$
  JOIN public.championship_bracket_editions AS editions_table ON editions_table.championship_id = matches_table.championship_id
$old_snapshot_joins$,
    $new_snapshot_joins$
  JOIN public.championship_bracket_editions AS editions_table ON editions_table.championship_id = matches_table.championship_id
  LEFT JOIN public.sports AS sports_table ON sports_table.id = matches_table.sport_id
  LEFT JOIN public.teams AS home_teams_table ON home_teams_table.id = matches_table.home_team_id
  LEFT JOIN public.teams AS away_teams_table ON away_teams_table.id = matches_table.away_team_id
$new_snapshot_joins$
  );

  updated_function_definition := replace(
    updated_function_definition,
    $old_match_number$'match_number', NULL,$old_match_number$,
    $new_match_number$'match_number', COALESCE(NULLIF(after_item.value->>'scheduled_slot', '')::integer, NULLIF(after_item.value->>'queue_position', '')::integer),$new_match_number$
  );

  IF updated_function_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível enriquecer a prévia da inversão da agenda.';
  END IF;

  EXECUTE updated_function_definition;
END;
$migration_reverse_day_court_match_order_preview$;

REVOKE ALL ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
