DO $$
DECLARE
  build_function_definition TEXT;
  placeholder_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(procedure_table.oid)
  INTO build_function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'build_day_schedule_reorganization_preview'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _payload jsonb';

  IF build_function_definition IS NULL
    OR position('manual_court_item_order JSONB' IN build_function_definition) = 0
    OR position('rest_conflicting_end TIMESTAMPTZ' IN build_function_definition) = 0
    OR position('''rest_conflicts''' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  loop_count INTEGER;' || E'\n',
    '  loop_count INTEGER;' || E'\n  should_recalculate_target_court BOOLEAN := false;' || E'\n'
  );
  build_function_definition := replace(
    build_function_definition,
    '  rest_conflicting_end TIMESTAMPTZ;' || E'\n',
    ''
  );
  build_function_definition := replace(
    build_function_definition,
    E'  SELECT breaks_table.*\n  INTO primary_break_record',
    E'  should_recalculate_target_court := COALESCE(cardinality(selected_match_ids), 0) > 0\n    OR EXISTS (\n      SELECT 1\n      FROM day_schedule_reorganization_items\n      WHERE bracket_court_id = target_court_record.id\n        AND manual_order_position IS NOT NULL\n    );\n\n  SELECT breaks_table.*\n  INTO primary_break_record'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  WHERE fixed_items.item_id = day_schedule_reorganization_items.item_id;\n\n  FOR item_record IN',
    E'  WHERE fixed_items.item_id = day_schedule_reorganization_items.item_id;\n\n  UPDATE day_schedule_reorganization_items\n  SET\n    planned_start_at = original_start_at,\n    planned_end_at = original_end_at,\n    planned_court_position = original_positions.court_position,\n    planned_queue_position = original_queue_position,\n    planned_scheduled_slot = original_scheduled_slot\n  FROM (\n    SELECT\n      item_id,\n      row_number() OVER (\n        PARTITION BY bracket_court_id\n        ORDER BY original_start_at, item_id\n      )::INTEGER AS court_position\n    FROM day_schedule_reorganization_items\n    WHERE is_selected = false\n  ) AS original_positions\n  WHERE original_positions.item_id = day_schedule_reorganization_items.item_id;\n\n  IF should_recalculate_target_court THEN\n    UPDATE day_schedule_reorganization_items\n    SET\n      planned_start_at = NULL,\n      planned_end_at = NULL,\n      planned_court_position = NULL,\n      planned_queue_position = NULL,\n      planned_scheduled_slot = NULL\n    WHERE bracket_court_id = target_court_record.id\n      AND is_fixed = false;\n  END IF;\n\n  FOR item_record IN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    WHERE is_fixed = false\n    ORDER BY',
    E'    WHERE is_fixed = false\n      AND should_recalculate_target_court\n      AND bracket_court_id = target_court_record.id\n    ORDER BY'
  );
  build_function_definition := replace(
    build_function_definition,
    E'      SELECT max(\n        GREATEST(\n          planned_end_at,\n          planned_start_at + make_interval(mins => GREATEST(item_record.duration_minutes, duration_minutes) * 4)\n        )\n      )\n      INTO rest_conflicting_end\n      FROM day_schedule_reorganization_items\n      WHERE planned_start_at IS NOT NULL\n        AND item_record.naipe = naipe\n        AND item_record.is_knockout = false\n        AND (\n          item_record.home_team_id = home_team_id\n          OR item_record.home_team_id = away_team_id\n          OR item_record.away_team_id = home_team_id\n          OR item_record.away_team_id = away_team_id\n        )\n        AND item_record.bracket_court_id <> bracket_court_id\n        AND public.is_championship_team_rest_gap_conflict(\n          item_record.naipe,\n          naipe,\n          false,\n          NULL,\n          NULL,\n          current_candidate_start,\n          planned_start_at,\n          item_record.duration_minutes,\n          duration_minutes,\n          item_record.is_knockout\n        );\n\n      IF rest_conflicting_end IS NOT NULL THEN\n        current_candidate_start := rest_conflicting_end;\n        CONTINUE;\n      END IF;\n\n',
    ''
  );
  build_function_definition := replace(
    build_function_definition,
    E'    IF EXISTS (\n      SELECT 1\n      FROM day_schedule_reorganization_items\n      WHERE planned_start_at IS NOT NULL\n        AND bracket_court_id = item_record.bracket_court_id\n        AND item_record.naipe = naipe\n        AND (\n          item_record.home_team_id = home_team_id\n          OR item_record.home_team_id = away_team_id\n          OR item_record.away_team_id = home_team_id\n          OR item_record.away_team_id = away_team_id\n        )\n        AND public.is_championship_team_rest_gap_conflict(\n          item_record.naipe,\n          naipe,\n          true,\n          candidate_court_position,\n          planned_court_position,\n          current_candidate_start,\n          planned_start_at,\n          item_record.duration_minutes,\n          duration_minutes,\n          item_record.is_knockout\n        )\n    ) THEN\n      blockers := blockers || jsonb_build_array(format(''A sequência de %s não respeita o descanso mínimo na mesma quadra.'', item_record.label));\n    END IF;\n\n',
    ''
  );
  build_function_definition := replace(
    build_function_definition,
    E'  WHERE numbered_items.item_id = items_table.item_id;',
    E'  WHERE numbered_items.item_id = items_table.item_id\n    AND should_recalculate_target_court\n    AND items_table.bracket_court_id = target_court_record.id;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  should_recalculate_target_court := COALESCE(cardinality(selected_match_ids), 0) > 0\n    OR EXISTS (\n      SELECT 1\n      FROM day_schedule_reorganization_items\n      WHERE bracket_court_id = target_court_record.id\n        AND manual_order_position IS NOT NULL\n    );',
    E'  should_recalculate_target_court := COALESCE(cardinality(selected_match_ids), 0) > 0\n    OR EXISTS (\n      SELECT 1\n      FROM day_schedule_reorganization_items\n      WHERE manual_order_position IS NOT NULL\n    );'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF should_recalculate_target_court THEN\n    UPDATE day_schedule_reorganization_items\n    SET\n      planned_start_at = NULL,\n      planned_end_at = NULL,\n      planned_court_position = NULL,\n      planned_queue_position = NULL,\n      planned_scheduled_slot = NULL\n    WHERE bracket_court_id = target_court_record.id\n      AND is_fixed = false;\n  END IF;',
    E'  IF should_recalculate_target_court THEN\n    UPDATE day_schedule_reorganization_items\n    SET\n      planned_start_at = NULL,\n      planned_end_at = NULL,\n      planned_court_position = NULL,\n      planned_queue_position = NULL,\n      planned_scheduled_slot = NULL\n    WHERE is_fixed = false\n      AND (\n        (\n          bracket_court_id = target_court_record.id\n          AND COALESCE(cardinality(selected_match_ids), 0) > 0\n        )\n        OR manual_order_position IS NOT NULL\n      );\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    WHERE is_fixed = false\n      AND should_recalculate_target_court\n      AND bracket_court_id = target_court_record.id\n    ORDER BY',
    E'    WHERE is_fixed = false\n      AND should_recalculate_target_court\n      AND (\n        (\n          bracket_court_id = target_court_record.id\n          AND COALESCE(cardinality(selected_match_ids), 0) > 0\n        )\n        OR manual_order_position IS NOT NULL\n      )\n    ORDER BY'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  WHERE numbered_items.item_id = items_table.item_id\n    AND should_recalculate_target_court\n    AND items_table.bracket_court_id = target_court_record.id;',
    E'  WHERE numbered_items.item_id = items_table.item_id\n    AND should_recalculate_target_court\n    AND (\n      (\n        items_table.bracket_court_id = target_court_record.id\n        AND COALESCE(cardinality(selected_match_ids), 0) > 0\n      )\n      OR items_table.manual_order_position IS NOT NULL\n    );'
  );
  IF position('should_recalculate_target_court BOOLEAN := false' IN build_function_definition) = 0
    OR position('should_recalculate_target_court := COALESCE(cardinality(selected_match_ids), 0) > 0' IN build_function_definition) = 0
    OR position('planned_queue_position = original_queue_position' IN build_function_definition) = 0
    OR position('AND should_recalculate_target_court' IN build_function_definition) = 0
    OR position('OR manual_order_position IS NOT NULL' IN build_function_definition) = 0
    OR position('rest_conflicting_end' IN build_function_definition) > 0
    OR position('A sequência de %s não respeita o descanso mínimo na mesma quadra.' IN build_function_definition) > 0
  THEN
    RAISE EXCEPTION 'Não foi possível preservar as quadras fora do encaixe manual.';
  END IF;

  EXECUTE build_function_definition;

  SELECT pg_get_functiondef(procedure_table.oid)
  INTO placeholder_function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'append_manual_relocation_placeholders'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _preview jsonb';

  IF placeholder_function_definition IS NULL
    OR position('competitions_table.championship_id' IN placeholder_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada dos slots de mata-mata não está instalada.';
  END IF;

  placeholder_function_definition := replace(
    placeholder_function_definition,
    E'FROM public.championship_bracket_competitions AS competitions_table\n  LEFT JOIN',
    E'FROM public.championship_bracket_competitions AS competitions_table\n  JOIN public.championship_bracket_editions AS editions_table\n    ON editions_table.id = competitions_table.bracket_edition_id\n  LEFT JOIN'
  );
  placeholder_function_definition := replace(
    placeholder_function_definition,
    'competitions_table.championship_id',
    'editions_table.championship_id'
  );
  placeholder_function_definition := replace(
    placeholder_function_definition,
    'competitions_table.season_year',
    'editions_table.season_year'
  );

  IF position('competitions_table.championship_id' IN placeholder_function_definition) > 0
    OR position('editions_table.championship_id' IN placeholder_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível corrigir a origem do campeonato para os slots planejados.';
  END IF;

  EXECUTE placeholder_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
