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
    OR position('FROM jsonb_array_elements(COALESCE(edition_payload->''resource_locks'', ''[]''::JSONB)) AS resource_lock(value)' IN build_function_definition) = 0
    OR position('resource_lock.value->>''court_key'' = item_record.court_group_id::TEXT' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'        AND NULLIF(resource_lock.value->>''start_time'', '''') IS NOT NULL\n        AND NULLIF(resource_lock.value->>''end_time'', '''') IS NOT NULL\n        AND current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, (resource_lock.value->>''end_time'')::TIME)',
    E'        AND NULLIF(resource_lock.value->>''start_time'', '''') IS NOT NULL\n        AND NULLIF(resource_lock.value->>''end_time'', '''') IS NOT NULL\n        AND NOT (\n          break_policy = ''REMOVE''\n          AND resource_lock.value->>''date'' = _payload->''removable_resource_lock''->>''date''\n          AND resource_lock.value->>''location_key'' = _payload->''removable_resource_lock''->>''location_group_id''\n          AND resource_lock.value->>''court_key'' = _payload->''removable_resource_lock''->>''court_group_id''\n          AND resource_lock.value->>''start_time'' = _payload->''removable_resource_lock''->>''start_time''\n          AND resource_lock.value->>''end_time'' = _payload->''removable_resource_lock''->>''end_time''\n          AND COALESCE(resource_lock.value->>''lock_mode'', '''') = ''HARD''\n          AND NULLIF(resource_lock.value->>''sport_id'', '''') IS NULL\n          AND NULLIF(resource_lock.value->>''naipe'', '''') IS NULL\n          AND NULLIF(resource_lock.value->>''division'', '''') IS NULL\n        )\n        AND current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, (resource_lock.value->>''end_time'')::TIME)'
  );

  IF position('_payload->''removable_resource_lock''->>''court_group_id''' IN build_function_definition) = 0
    OR position('COALESCE(resource_lock.value->>''lock_mode'', '''') = ''HARD''' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível liberar a reserva de intervalo na prévia de reorganização.';
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
    OR position(E'UPDATE public.championship_bracket_editions\n  SET reprogramming_revision = reprogramming_revision + 1' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da confirmação de reorganização diária não está instalada.';
  END IF;

  apply_function_definition := replace(
    apply_function_definition,
    E'  UPDATE public.championship_bracket_editions\n  SET reprogramming_revision = reprogramming_revision + 1\n  WHERE id = _bracket_edition_id;',
    E'  IF break_policy = ''REMOVE''\n    AND _payload ? ''removable_resource_lock''\n  THEN\n    UPDATE public.championship_bracket_editions\n    SET payload_snapshot = jsonb_set(\n      payload_snapshot,\n      ''{resource_locks}'',\n      COALESCE((\n        SELECT jsonb_agg(resource_lock.value)\n        FROM jsonb_array_elements(COALESCE(payload_snapshot->''resource_locks'', ''[]''::JSONB)) AS resource_lock(value)\n        WHERE NOT (\n          resource_lock.value->>''date'' = _payload->''removable_resource_lock''->>''date''\n          AND resource_lock.value->>''location_key'' = _payload->''removable_resource_lock''->>''location_group_id''\n          AND resource_lock.value->>''court_key'' = _payload->''removable_resource_lock''->>''court_group_id''\n          AND resource_lock.value->>''start_time'' = _payload->''removable_resource_lock''->>''start_time''\n          AND resource_lock.value->>''end_time'' = _payload->''removable_resource_lock''->>''end_time''\n          AND COALESCE(resource_lock.value->>''lock_mode'', '''') = ''HARD''\n          AND NULLIF(resource_lock.value->>''sport_id'', '''') IS NULL\n          AND NULLIF(resource_lock.value->>''naipe'', '''') IS NULL\n          AND NULLIF(resource_lock.value->>''division'', '''') IS NULL\n        )\n      ), ''[]''::JSONB),\n      true\n    )\n    WHERE id = _bracket_edition_id;\n  END IF;\n\n  UPDATE public.championship_bracket_editions\n  SET reprogramming_revision = reprogramming_revision + 1\n  WHERE id = _bracket_edition_id;'
  );

  IF position('payload_snapshot = jsonb_set(' IN apply_function_definition) = 0
    OR position('_payload ? ''removable_resource_lock''' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível persistir a remoção da reserva de intervalo.';
  END IF;

  EXECUTE apply_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
