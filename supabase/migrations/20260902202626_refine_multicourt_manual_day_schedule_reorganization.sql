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
    OR position('WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN' IN build_function_definition) = 0
    OR position('primary_break_record.id IS NULL OR breaks_table.id <> primary_break_record.id' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da reorganização diária manual não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  relocation_reason TEXT;' || E'\n',
    '  relocation_reason TEXT;' || E'\n  manual_court_item_order JSONB;' || E'\n'
  );
  build_function_definition := replace(
    build_function_definition,
    '  relocation_reason := upper(trim(COALESCE(_payload->>''reason'', '''')));' || E'\n',
    '  relocation_reason := upper(trim(COALESCE(_payload->>''reason'', '''')));' || E'\n  manual_court_item_order := COALESCE(_payload->''manual_court_item_order'', ''{}''::JSONB);' || E'\n'
  );
  build_function_definition := replace(
    build_function_definition,
    '    selection_order INTEGER NULL,' || E'\n    planned_start_at TIMESTAMPTZ NULL,',
    '    selection_order INTEGER NULL,' || E'\n    manual_order_position INTEGER NULL,' || E'\n    planned_start_at TIMESTAMPTZ NULL,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  SELECT breaks_table.*\n  INTO primary_break_record',
    E'  UPDATE day_schedule_reorganization_items AS items_table\n  SET manual_order_position = manual_order_items.position\n  FROM jsonb_each(manual_court_item_order) AS court_order(court_name, item_ids)\n  CROSS JOIN LATERAL jsonb_array_elements_text(court_order.item_ids) WITH ORDINALITY AS manual_order_items(item_id, position)\n  WHERE items_table.court_name = court_order.court_name\n    AND items_table.item_id::TEXT = manual_order_items.item_id;\n\n  SELECT breaks_table.*\n  INTO primary_break_record'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    ORDER BY\n      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''MANUAL'' AND item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID THEN 0\n        WHEN strategy = ''MANUAL'' AND is_selected THEN 1\n        WHEN strategy = ''MANUAL'' AND is_knockout THEN 3\n        WHEN strategy = ''MANUAL''\n          AND bracket_court_id = target_court_record.id\n          AND original_start_at <= (\n            SELECT anchor_item.original_start_at\n            FROM day_schedule_reorganization_items AS anchor_item\n            WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n          ) THEN 0\n        WHEN strategy = ''MANUAL'' THEN 2\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,\n      CASE WHEN is_selected THEN selection_order ELSE NULL END NULLS LAST,\n      original_start_at,',
    E'    ORDER BY\n      CASE\n        WHEN strategy = ''MANUAL'' AND manual_order_position IS NOT NULL THEN 0\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''MANUAL'' AND item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID THEN 0\n        WHEN strategy = ''MANUAL'' AND is_selected THEN 1\n        WHEN strategy = ''MANUAL'' AND is_knockout THEN 3\n        WHEN strategy = ''MANUAL''\n          AND bracket_court_id = target_court_record.id\n          AND original_start_at <= (\n            SELECT anchor_item.original_start_at\n            FROM day_schedule_reorganization_items AS anchor_item\n            WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n          ) THEN 0\n        WHEN strategy = ''MANUAL'' THEN 2\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,\n      CASE WHEN strategy = ''MANUAL'' THEN manual_order_position ELSE NULL END NULLS LAST,\n      CASE WHEN is_selected THEN selection_order ELSE NULL END NULLS LAST,\n      original_start_at,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'        WHEN strategy = ''MANUAL''\n          AND bracket_court_id = target_court_record.id\n          AND original_start_at <= (\n            SELECT anchor_item.original_start_at\n            FROM day_schedule_reorganization_items AS anchor_item\n            WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n          ) THEN 0',
    E'        WHEN strategy = ''MANUAL''\n          AND original_start_at < (\n            SELECT anchor_item.original_end_at\n            FROM day_schedule_reorganization_items AS anchor_item\n            WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n          ) THEN 0'
  );
  build_function_definition := replace(
    build_function_definition,
    E'        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0',
    E'        WHEN strategy = ''AUTO''\n          AND bracket_court_id = target_court_record.id\n          AND is_knockout\n        THEN 3\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO''\n          AND bracket_court_id = target_court_record.id\n        THEN 0\n        WHEN strategy = ''AUTO''\n          AND original_start_at < COALESCE((\n            SELECT max(target_group_items.original_end_at)\n            FROM day_schedule_reorganization_items AS target_group_items\n            WHERE target_group_items.bracket_court_id = target_court_record.id\n              AND target_group_items.is_selected = false\n              AND target_group_items.is_knockout = false\n          ), ''infinity''::TIMESTAMPTZ)\n        THEN 0\n        WHEN strategy = ''AUTO'' THEN 2'
  );
  build_function_definition := replace(
    build_function_definition,
    E'          WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN\n            COALESCE((\n              SELECT anchor_item.planned_end_at\n              FROM day_schedule_reorganization_items AS anchor_item\n              WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n            ), day_start_at) + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')',
    E'          WHEN strategy = ''MANUAL''\n            AND item_record.is_selected\n            AND item_record.manual_order_position IS NULL\n          THEN\n            COALESCE((\n              SELECT anchor_item.planned_end_at\n              FROM day_schedule_reorganization_items AS anchor_item\n              WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n            ), day_start_at) + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')'
  );
  build_function_definition := replace(
    build_function_definition,
    E'          ELSE item_record.original_start_at\n        END,',
    E'          ELSE COALESCE((\n            SELECT max(previous_items.planned_end_at)\n            FROM day_schedule_reorganization_items AS previous_items\n            WHERE previous_items.bracket_court_id = item_record.bracket_court_id\n              AND previous_items.planned_end_at IS NOT NULL\n          ), day_start_at)\n        END,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'      ''is_relocated'', is_selected,\n      ''is_displaced'',',
    E'      ''is_relocated'', is_selected,\n      ''is_fixed'', is_fixed,\n      ''rest_conflicts'', CASE WHEN EXISTS (\n        SELECT 1\n        FROM day_schedule_reorganization_items AS conflicting_items\n        WHERE conflicting_items.item_id <> timeline_items.item_id\n          AND conflicting_items.naipe = timeline_items.naipe\n          AND conflicting_items.is_knockout = false\n          AND (\n            timeline_items.home_team_id = conflicting_items.home_team_id\n            OR timeline_items.home_team_id = conflicting_items.away_team_id\n            OR timeline_items.away_team_id = conflicting_items.home_team_id\n            OR timeline_items.away_team_id = conflicting_items.away_team_id\n          )\n          AND public.is_championship_team_rest_gap_conflict(\n            timeline_items.naipe,\n            conflicting_items.naipe,\n            conflicting_items.bracket_court_id = timeline_items.bracket_court_id,\n            timeline_items.planned_court_position,\n            conflicting_items.planned_court_position,\n            timeline_items.planned_start_at,\n            conflicting_items.planned_start_at,\n            timeline_items.duration_minutes,\n            conflicting_items.duration_minutes,\n            conflicting_items.is_knockout\n          )\n      ) THEN jsonb_build_array(''Descanso insuficiente para esta atlética e naipe.'') ELSE ''[]''::JSONB END,\n      ''is_displaced'', '
  );
  build_function_definition := replace(
    build_function_definition,
    E'  INTO timeline\n  FROM day_schedule_reorganization_items;',
    E'  INTO timeline\n  FROM day_schedule_reorganization_items AS timeline_items;'
  );

  IF position('manual_court_item_order JSONB' IN build_function_definition) = 0
    OR position('manual_order_position INTEGER NULL' IN build_function_definition) = 0
    OR position('jsonb_each(manual_court_item_order)' IN build_function_definition) = 0
    OR position('original_start_at < (' IN build_function_definition) = 0
    OR position('target_group_items.original_end_at' IN build_function_definition) = 0
    OR position('previous_items.bracket_court_id = item_record.bracket_court_id' IN build_function_definition) = 0
    OR position('''rest_conflicts''' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível compactar a agenda multi-quadra.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
