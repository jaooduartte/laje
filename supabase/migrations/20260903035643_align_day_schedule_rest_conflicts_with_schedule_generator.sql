DO $$
DECLARE
  build_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(procedure_table.oid)
  INTO build_function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'build_day_schedule_reorganization_preview'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _payload jsonb';

  IF build_function_definition IS NULL
    OR position('public.is_championship_team_rest_gap_conflict(' IN build_function_definition) = 0
    OR position('conflicting_items.naipe = timeline_items.naipe' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'          AND public.is_championship_team_rest_gap_conflict(\n            timeline_items.naipe,\n            conflicting_items.naipe,\n            conflicting_items.bracket_court_id = timeline_items.bracket_court_id,\n            timeline_items.planned_court_position,\n            conflicting_items.planned_court_position,\n            timeline_items.planned_start_at,\n            conflicting_items.planned_start_at,\n            timeline_items.duration_minutes,\n            conflicting_items.duration_minutes,\n            conflicting_items.is_knockout\n          )',
    E'          AND timeline_items.is_knockout = false\n          AND (\n            CASE\n              WHEN conflicting_items.bracket_court_id = timeline_items.bracket_court_id\n              THEN abs(\n                timeline_items.planned_court_position\n                  - conflicting_items.planned_court_position\n              ) < CASE\n                WHEN timeline_items.sport_id = conflicting_items.sport_id THEN 3\n                ELSE 2\n              END\n              ELSE abs(\n                extract(epoch FROM (\n                  conflicting_items.planned_start_at\n                    - timeline_items.planned_start_at\n                )) / 60.0\n              ) < greatest(\n                greatest(timeline_items.duration_minutes, 1),\n                greatest(conflicting_items.duration_minutes, 1)\n              ) * CASE\n                WHEN timeline_items.sport_id = conflicting_items.sport_id THEN 3\n                ELSE 2\n              END\n            END\n          )'
  );

  IF position('public.is_championship_team_rest_gap_conflict(' IN build_function_definition) > 0
    OR position('timeline_items.sport_id = conflicting_items.sport_id THEN 3' IN build_function_definition) = 0
    OR position('ELSE 2' IN build_function_definition) = 0
    OR position('timeline_items.is_knockout = false' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível alinhar o descanso da prévia ao gerador do campeonato.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
