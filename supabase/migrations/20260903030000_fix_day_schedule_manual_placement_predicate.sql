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
    OR position(E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NOT EXISTS (\n      SELECT 1\n      FROM unnest(selected_match_ids) AS selected_match_item(match_id)' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da validação dos jogos encaixados não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND NOT EXISTS (\n      SELECT 1\n      FROM unnest(selected_match_ids) AS selected_match_item(match_id)',
    E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND EXISTS (\n      SELECT 1\n      FROM unnest(selected_match_ids) AS selected_match_item(match_id)'
  );

  IF position(E'  IF strategy = ''MANUAL''\n    AND COALESCE(cardinality(selected_match_ids), 0) > 0\n    AND EXISTS (\n      SELECT 1\n      FROM unnest(selected_match_ids) AS selected_match_item(match_id)' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível corrigir a validação dos jogos encaixados.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
