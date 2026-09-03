DO $$
DECLARE
  build_function_definition TEXT;
  apply_function_definition TEXT;
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
    OR position('manual_order_position INTEGER NULL' IN build_function_definition) = 0
    OR position('Escolha o jogo após o qual os jogos selecionados serão encaixados.' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da reorganização diária manual não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  selected_match_ids UUID[];' || E'\n',
    '  selected_match_ids UUID[];' || E'\n  source_match_ids UUID[];' || E'\n'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  SELECT array_agg(value::UUID)\n  INTO selected_match_ids\n  FROM jsonb_array_elements_text(COALESCE(_payload->''match_ids'', ''[]''::JSONB)) AS value;',
    E'  SELECT array_agg(value::UUID)\n  INTO source_match_ids\n  FROM jsonb_array_elements_text(COALESCE(_payload->''match_ids'', ''[]''::JSONB)) AS value;\n\n  SELECT array_agg(value::UUID)\n  INTO selected_match_ids\n  FROM jsonb_array_elements_text(COALESCE(_payload->''placed_match_ids'', ''[]''::JSONB)) AS value;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF COALESCE(cardinality(selected_match_ids), 0) = 0 THEN\n    RAISE EXCEPTION ''Selecione ao menos um jogo aguardando realocação.'';\n  END IF;',
    E'  IF COALESCE(cardinality(source_match_ids), 0) = 0 THEN\n    RAISE EXCEPTION ''Selecione ao menos um jogo aguardando realocação.'';\n  END IF;\n\n  IF COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NOT (selected_match_ids <@ source_match_ids)\n  THEN\n    RAISE EXCEPTION ''Os jogos posicionados precisam pertencer à seleção original.'';\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NULLIF(_payload->>''manual_anchor_item_id'', '''') IS NULL\n  THEN\n    RAISE EXCEPTION ''Escolha o jogo após o qual os jogos selecionados serão encaixados.'';\n  END IF;',
    E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NOT EXISTS (\n      SELECT 1\n      FROM unnest(selected_match_ids) AS selected_match_id\n      WHERE NOT EXISTS (\n        SELECT 1\n        FROM jsonb_each(manual_court_item_order) AS court_order(court_name, item_ids)\n        CROSS JOIN LATERAL jsonb_array_elements_text(court_order.item_ids) AS item_id\n        WHERE item_id = selected_match_id::TEXT\n      )\n    )\n  THEN\n    RAISE EXCEPTION ''Posicione todos os jogos selecionados no cronograma.'';\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id\n    AND matches_table.id = ANY(selected_match_ids)\n    AND matches_table.status = ''SCHEDULED''::public.match_status\n    AND COALESCE(matches_table.is_pending_manual_relocation, false);\n\n  IF selected_matches_count <> cardinality(selected_match_ids) THEN',
    E'  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id\n    AND matches_table.id = ANY(source_match_ids)\n    AND matches_table.status = ''SCHEDULED''::public.match_status\n    AND COALESCE(matches_table.is_pending_manual_relocation, false);\n\n  IF selected_matches_count <> cardinality(source_match_ids) THEN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    WHERE matches_table.id = ANY(selected_match_ids)\n      AND NOT EXISTS (',
    E'    WHERE matches_table.id = ANY(source_match_ids)\n      AND NOT EXISTS ('
  );
  build_function_definition := replace(
    build_function_definition,
    E'THEN jsonb_build_array(''Descanso insuficiente para esta atlética e naipe.'') ELSE ''[]''::JSONB END,',
    E'THEN COALESCE((\n        SELECT jsonb_agg(\n          format(\n            ''Descanso insuficiente no naipe %s: conflito com %s na %s, %s–%s.'',\n            timeline_items.naipe,\n            conflicting_items.label,\n            conflicting_items.court_name,\n            to_char(conflicting_items.planned_start_at AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI''),\n            to_char(conflicting_items.planned_end_at AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'')\n          )\n        )\n        FROM day_schedule_reorganization_items AS conflicting_items\n        WHERE conflicting_items.item_id <> timeline_items.item_id\n          AND conflicting_items.naipe = timeline_items.naipe\n          AND conflicting_items.is_knockout = false\n          AND (\n            timeline_items.home_team_id = conflicting_items.home_team_id\n            OR timeline_items.home_team_id = conflicting_items.away_team_id\n            OR timeline_items.away_team_id = conflicting_items.home_team_id\n            OR timeline_items.away_team_id = conflicting_items.away_team_id\n          )\n          AND public.is_championship_team_rest_gap_conflict(\n            timeline_items.naipe,\n            conflicting_items.naipe,\n            conflicting_items.bracket_court_id = timeline_items.bracket_court_id,\n            timeline_items.planned_court_position,\n            conflicting_items.planned_court_position,\n            timeline_items.planned_start_at,\n            conflicting_items.planned_start_at,\n            timeline_items.duration_minutes,\n            conflicting_items.duration_minutes,\n            conflicting_items.is_knockout\n          )\n      ), ''[]''::JSONB) ELSE ''[]''::JSONB END,'
  );

  IF position('source_match_ids UUID[]' IN build_function_definition) = 0
    OR position('placed_match_ids' IN build_function_definition) = 0
    OR position('selected_match_ids <@ source_match_ids' IN build_function_definition) = 0
    OR position('matches_table.id = ANY(source_match_ids)' IN build_function_definition) = 0
    OR position('Posicione todos os jogos selecionados no cronograma.' IN build_function_definition) = 0
    OR position('conflito com %s na %s' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível preparar o encaixe por arrastar e soltar.';
  END IF;

  EXECUTE build_function_definition;

  SELECT pg_get_functiondef(procedure_table.oid)
  INTO apply_function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'apply_day_schedule_reorganization'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _payload jsonb, _expected_revision bigint';

  IF apply_function_definition IS NULL
    OR position('preview := public.build_day_schedule_reorganization_preview' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A confirmação esperada da reorganização diária não está instalada.';
  END IF;

  apply_function_definition := replace(
    apply_function_definition,
    E'BEGIN\n  IF NOT public.has_admin_tab_access',
    E'BEGIN\n  IF COALESCE(jsonb_array_length(COALESCE(_payload->''match_ids'', ''[]''::JSONB)), 0) = 0\n    OR jsonb_array_length(COALESCE(_payload->''placed_match_ids'', ''[]''::JSONB)) <> jsonb_array_length(COALESCE(_payload->''match_ids'', ''[]''::JSONB))\n    OR EXISTS (\n      SELECT 1\n      FROM jsonb_array_elements_text(COALESCE(_payload->''placed_match_ids'', ''[]''::JSONB)) AS placed_match_id\n      WHERE NOT (COALESCE(_payload->''match_ids'', ''[]''::JSONB) ? placed_match_id)\n    )\n  THEN\n    RAISE EXCEPTION ''Posicione todos os jogos selecionados antes de confirmar.'';\n  END IF;\n\n  IF NOT public.has_admin_tab_access'
  );
  apply_function_definition := replace(
    apply_function_definition,
    E'  IF jsonb_array_length(COALESCE(preview->''blockers'', ''[]''::JSONB)) > 0 THEN\n    RAISE EXCEPTION ''A reorganização possui conflitos e não pode ser aplicada.'';\n  END IF;',
    E'  IF jsonb_array_length(COALESCE(preview->''blockers'', ''[]''::JSONB)) > 0\n    OR EXISTS (\n      SELECT 1\n      FROM jsonb_array_elements(COALESCE(preview->''timeline'', ''[]''::JSONB)) AS timeline_item\n      WHERE jsonb_array_length(COALESCE(timeline_item->''rest_conflicts'', ''[]''::JSONB)) > 0\n    )\n  THEN\n    RAISE EXCEPTION ''A reorganização possui conflitos e não pode ser aplicada.'';\n  END IF;'
  );

  IF position('Posicione todos os jogos selecionados antes de confirmar.' IN apply_function_definition) = 0
    OR position('timeline_item->''rest_conflicts''' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível proteger a confirmação por arrastar e soltar.';
  END IF;

  EXECUTE apply_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
