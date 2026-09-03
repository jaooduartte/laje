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
    OR position('relocation_notes := NULLIF(trim(COALESCE(_payload->>''notes'', '''')), '''');' IN build_function_definition) = 0
    OR position('AND breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  relocation_notes TEXT;' || E'\n',
    ''
  );
  build_function_definition := replace(
    build_function_definition,
    '  relocation_notes := NULLIF(trim(COALESCE(_payload->>''notes'', '''')), '''');' || E'\n',
    ''
  );
  build_function_definition := replace(
    build_function_definition,
    E'  SELECT breaks_table.*\n  INTO primary_break_record\n  FROM public.championship_bracket_day_breaks AS breaks_table\n  WHERE breaks_table.bracket_day_id = day_record.id\n    AND breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n  ORDER BY breaks_table.position, breaks_table.break_start_time\n  LIMIT 1;',
    E'  SELECT breaks_table.*\n  INTO primary_break_record\n  FROM public.championship_bracket_day_breaks AS breaks_table\n  WHERE breaks_table.bracket_day_id = day_record.id\n    AND (\n      breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n      OR (\n        breaks_table.scope_type = ''COURT''::public.bracket_day_break_scope_type\n        AND breaks_table.bracket_court_id = target_court_record.id\n      )\n    )\n  ORDER BY\n    CASE WHEN breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type THEN 0 ELSE 1 END,\n    breaks_table.position,\n    breaks_table.break_start_time\n  LIMIT 1;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF primary_break_record.id IS NOT NULL AND break_policy = ''KEEP_BEFORE_KNOCKOUT'' THEN\n    primary_break_duration := primary_break_record.break_end_time - primary_break_record.break_start_time;\n\n    SELECT *\n    INTO knockout_anchor_record\n    FROM day_schedule_reorganization_items\n    WHERE is_knockout\n      AND original_start_at >= public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n    ORDER BY original_start_at, original_scheduled_slot, item_id\n    LIMIT 1;\n\n    IF knockout_anchor_record.item_id IS NULL THEN\n      blockers := blockers || jsonb_build_array(''Não há jogo de mata-mata após o intervalo para preservar sua posição.'');\n      next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n      next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n    ELSE\n      next_break_end_at := knockout_anchor_record.original_start_at;\n      next_break_start_at := next_break_end_at - primary_break_duration;\n      UPDATE day_schedule_reorganization_items\n      SET is_fixed = true\n      WHERE item_id = knockout_anchor_record.item_id;\n    END IF;\n  ELSE\n    next_break_start_at := NULL;\n    next_break_end_at := NULL;\n  END IF;',
    E'  IF primary_break_record.id IS NOT NULL AND break_policy = ''KEEP_BEFORE_KNOCKOUT'' THEN\n    IF primary_break_record.scope_type = ''COURT''::public.bracket_day_break_scope_type THEN\n      next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n      next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n    ELSE\n      primary_break_duration := primary_break_record.break_end_time - primary_break_record.break_start_time;\n\n      SELECT *\n      INTO knockout_anchor_record\n      FROM day_schedule_reorganization_items\n      WHERE is_knockout\n        AND original_start_at >= public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n      ORDER BY original_start_at, original_scheduled_slot, item_id\n      LIMIT 1;\n\n      IF knockout_anchor_record.item_id IS NULL THEN\n        blockers := blockers || jsonb_build_array(''Não há jogo de mata-mata após o intervalo para preservar sua posição.'');\n        next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n        next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n      ELSE\n        next_break_end_at := knockout_anchor_record.original_start_at;\n        next_break_start_at := next_break_end_at - primary_break_duration;\n        UPDATE day_schedule_reorganization_items\n        SET is_fixed = true\n        WHERE item_id = knockout_anchor_record.item_id;\n      END IF;\n    END IF;\n  ELSE\n    next_break_start_at := NULL;\n    next_break_end_at := NULL;\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'      IF next_break_start_at IS NOT NULL\n        AND current_candidate_start < next_break_end_at\n        AND candidate_end > next_break_start_at\n      THEN',
    E'      IF next_break_start_at IS NOT NULL\n        AND (\n          primary_break_record.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n          OR item_record.bracket_court_id = primary_break_record.bracket_court_id\n        )\n        AND current_candidate_start < next_break_end_at\n        AND candidate_end > next_break_start_at\n      THEN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    ''reason'', relocation_reason,\n    ''notes'', relocation_notes,\n    ''representation_warning'',',
    E'    ''reason'', relocation_reason,\n    ''representation_warning'','
  );

  IF position('breaks_table.bracket_court_id = target_court_record.id' IN build_function_definition) = 0
    OR position('primary_break_record.scope_type' IN build_function_definition) = 0
    OR position('next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);' IN build_function_definition) = 0
    OR position('relocation_notes' IN build_function_definition) > 0
  THEN
    RAISE EXCEPTION 'Não foi possível incluir o intervalo da quadra-base na prévia de reorganização.';
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
    OR position('manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULLIF(preview->>''notes'', '''') ELSE matches_table.manual_schedule_override_notes END,' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da confirmação de reorganização diária não está instalada.';
  END IF;

  apply_function_definition := replace(
    apply_function_definition,
    '    manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULLIF(preview->>''notes'', '''') ELSE matches_table.manual_schedule_override_notes END,',
    '    manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.manual_schedule_override_notes END,'
  );
  apply_function_definition := replace(
    apply_function_definition,
    E'      WHERE breaks_table.bracket_day_id = days_table.id\n      ORDER BY breaks_table.position, breaks_table.break_start_time',
    E'      WHERE breaks_table.bracket_day_id = days_table.id\n        AND breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n      ORDER BY breaks_table.position, breaks_table.break_start_time'
  );

  IF position('preview->>''notes''' IN apply_function_definition) > 0
    OR position('AND breaks_table.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type' IN apply_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível atualizar a confirmação da reorganização diária.';
  END IF;

  EXECUTE apply_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
