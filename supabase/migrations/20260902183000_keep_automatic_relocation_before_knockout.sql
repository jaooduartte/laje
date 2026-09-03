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
    OR position('WHEN strategy = ''AUTO'' AND item_record.is_selected THEN' IN build_function_definition) = 0
    OR position('WHEN strategy = ''AUTO'' AND is_knockout THEN 2' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização automática não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at\n          ELSE item_record.original_start_at\n        END,',
    E'          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at\n          WHEN strategy = ''AUTO''\n            AND item_record.is_knockout\n            AND item_record.bracket_court_id = target_court_record.id\n          THEN GREATEST(\n            item_record.original_start_at,\n            COALESCE((\n              SELECT max(selected_items.planned_end_at)\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.bracket_court_id = target_court_record.id\n                AND selected_items.planned_end_at IS NOT NULL\n            ), day_start_at)\n          )\n          ELSE item_record.original_start_at\n        END,'
  );

  IF position('AND item_record.is_knockout' IN build_function_definition) = 0
    OR position('max(selected_items.planned_end_at)' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível manter os jogos encaixados antes do mata-mata.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
