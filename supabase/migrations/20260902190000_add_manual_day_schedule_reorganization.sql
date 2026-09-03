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
    OR position('IF strategy NOT IN (''START'', ''END'', ''AUTO'') THEN' IN build_function_definition) = 0
    OR position('WHEN strategy = ''AUTO'' AND item_record.is_selected THEN' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  IF strategy NOT IN (''START'', ''END'', ''AUTO'') THEN',
    E'  IF strategy NOT IN (''START'', ''END'', ''AUTO'', ''MANUAL'') THEN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF break_policy NOT IN (''KEEP_BEFORE_KNOCKOUT'', ''REMOVE'') THEN',
    E'  IF strategy = ''MANUAL'' AND NULLIF(_payload->>''manual_anchor_item_id'', '''') IS NULL THEN\n    RAISE EXCEPTION ''Escolha o jogo após o qual os jogos selecionados serão encaixados.'';\n  END IF;\n\n  IF break_policy NOT IN (''KEEP_BEFORE_KNOCKOUT'', ''REMOVE'') THEN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,',
    E'      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''MANUAL'' AND item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID THEN 0\n        WHEN strategy = ''MANUAL'' AND is_selected THEN 1\n        WHEN strategy = ''MANUAL'' AND is_knockout THEN 3\n        WHEN strategy = ''MANUAL'' AND original_start_at <= (\n          SELECT anchor_item.original_start_at\n          FROM day_schedule_reorganization_items AS anchor_item\n          WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n        ) THEN 0\n        WHEN strategy = ''MANUAL'' THEN 2\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at',
    E'          WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN\n            COALESCE((\n              SELECT anchor_item.planned_end_at\n              FROM day_schedule_reorganization_items AS anchor_item\n              WHERE anchor_item.item_id = NULLIF(_payload->>''manual_anchor_item_id'', '''')::UUID\n            ), day_start_at) + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')\n          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    ''insertion_position'', CASE WHEN strategy = ''START'' THEN ''START'' WHEN strategy = ''END'' THEN ''END'' ELSE ''SLOT'' END,',
    E'    ''insertion_position'', CASE WHEN strategy = ''START'' THEN ''START'' WHEN strategy = ''END'' THEN ''END'' ELSE ''SLOT'' END,\n    ''manual_anchor_item_id'', CASE WHEN strategy = ''MANUAL'' THEN NULLIF(_payload->>''manual_anchor_item_id'', '''') ELSE NULL END,'
  );

  IF position('strategy NOT IN (''START'', ''END'', ''AUTO'', ''MANUAL'')' IN build_function_definition) = 0
    OR position('manual_anchor_item_id' IN build_function_definition) = 0
    OR position('WHEN strategy = ''MANUAL'' AND item_record.is_selected THEN' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível incluir o encaixe manual na reorganização diária.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
