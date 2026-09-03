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
    OR position('''is_displaced'', is_selected = false AND (' IN build_function_definition) = 0
    OR position('OR original_scheduled_slot IS DISTINCT FROM planned_scheduled_slot' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da timeline de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'      ''is_displaced'', is_selected = false AND (\n        original_start_at IS DISTINCT FROM planned_start_at\n        OR original_end_at IS DISTINCT FROM planned_end_at\n        OR original_queue_position IS DISTINCT FROM planned_queue_position\n        OR original_scheduled_slot IS DISTINCT FROM planned_scheduled_slot\n      )',
    E'      ''is_displaced'', is_selected = false AND (\n        original_start_at IS DISTINCT FROM planned_start_at\n        OR original_end_at IS DISTINCT FROM planned_end_at\n      )'
  );

  IF position(E'      ''is_displaced'', is_selected = false AND (\n        original_start_at IS DISTINCT FROM planned_start_at\n        OR original_end_at IS DISTINCT FROM planned_end_at\n      )' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível limitar o badge de reposicionamento às mudanças de horário.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
