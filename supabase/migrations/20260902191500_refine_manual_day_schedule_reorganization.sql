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
    OR position('''START'', ''END'', ''AUTO'', ''MANUAL''' IN build_function_definition) = 0
    OR position('WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de encaixe manual não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'  IF COALESCE(cardinality(selected_match_ids), 0) = 0\n    RAISE EXCEPTION ''Selecione ao menos um jogo aguardando realocação.'';\n  END IF;',
    E'  IF COALESCE(cardinality(selected_match_ids), 0) = 0\n    AND NOT (\n      strategy = ''MANUAL''\n      AND NULLIF(_payload->>''manual_anchor_item_id'', '''') IS NULL\n    )\n  THEN\n    RAISE EXCEPTION ''Selecione ao menos um jogo aguardando realocação.'';\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF strategy = ''MANUAL'' AND NULLIF(_payload->>''manual_anchor_item_id'', '''') IS NULL THEN\n    RAISE EXCEPTION ''Escolha o jogo após o qual os jogos selecionados serão encaixados.'';\n  END IF;',
    E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NULLIF(_payload->>''manual_anchor_item_id'', '''') IS NULL\n  THEN\n    RAISE EXCEPTION ''Escolha o jogo após o qual os jogos selecionados serão encaixados.'';\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'        WHEN strategy = ''MANUAL'' AND original_start_at <= (\n          SELECT anchor_item.original_start_at\n          FROM day_schedule_reorganization_items AS anchor_item\n          WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n        ) THEN 0',
    E'        WHEN strategy = ''MANUAL''\n          AND bracket_court_id = target_court_record.id\n          AND original_start_at <= (\n            SELECT anchor_item.original_start_at\n            FROM day_schedule_reorganization_items AS anchor_item\n            WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n          ) THEN 0'
  );

  IF position('AND NOT (' IN build_function_definition) = 0
    OR position('COALESCE(cardinality(selected_match_ids), 0) > 0' IN build_function_definition) = 0
    OR position('AND bracket_court_id = target_court_record.id' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível preparar a agenda-base ou priorizar o encaixe manual.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
