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
    OR position('breaks_table.bracket_court_id = target_court_record.id' IN build_function_definition) = 0
    OR position('WHEN strategy = ''END'' AND is_selected THEN 2' IN build_function_definition) = 0
    OR position('WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da prévia de reorganização diária não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    '  previous_day_end TEXT;' || E'\n',
    '  previous_day_end TEXT;' || E'\n  should_reposition_target_court_break BOOLEAN := false;' || E'\n'
  );
  build_function_definition := replace(
    build_function_definition,
    E'  IF primary_break_record.id IS NOT NULL AND break_policy = ''KEEP_BEFORE_KNOCKOUT'' THEN\n    IF primary_break_record.scope_type = ''COURT''::public.bracket_day_break_scope_type THEN\n      next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n      next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n    ELSE\n      primary_break_duration := primary_break_record.break_end_time - primary_break_record.break_start_time;\n\n      SELECT *\n      INTO knockout_anchor_record\n      FROM day_schedule_reorganization_items\n      WHERE is_knockout\n        AND original_start_at >= public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n      ORDER BY original_start_at, original_scheduled_slot, item_id\n      LIMIT 1;\n\n      IF knockout_anchor_record.item_id IS NULL THEN\n        blockers := blockers || jsonb_build_array(''Não há jogo de mata-mata após o intervalo para preservar sua posição.'');\n        next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n        next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n      ELSE\n        next_break_end_at := knockout_anchor_record.original_start_at;\n        next_break_start_at := next_break_end_at - primary_break_duration;\n        UPDATE day_schedule_reorganization_items\n        SET is_fixed = true\n        WHERE item_id = knockout_anchor_record.item_id;\n      END IF;\n    END IF;\n  ELSE\n    next_break_start_at := NULL;\n    next_break_end_at := NULL;\n  END IF;',
    E'  IF primary_break_record.id IS NOT NULL AND break_policy = ''KEEP_BEFORE_KNOCKOUT'' THEN\n    primary_break_duration := primary_break_record.break_end_time - primary_break_record.break_start_time;\n\n    IF primary_break_record.scope_type = ''COURT''::public.bracket_day_break_scope_type THEN\n      next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n      next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n    ELSE\n      SELECT *\n      INTO knockout_anchor_record\n      FROM day_schedule_reorganization_items\n      WHERE is_knockout\n        AND original_start_at >= public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n      ORDER BY original_start_at, original_scheduled_slot, item_id\n      LIMIT 1;\n\n      IF knockout_anchor_record.item_id IS NULL THEN\n        blockers := blockers || jsonb_build_array(''Não há jogo de mata-mata após o intervalo para preservar sua posição.'');\n        next_break_start_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_start_time);\n        next_break_end_at := public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time);\n      ELSE\n        next_break_end_at := knockout_anchor_record.original_start_at;\n        next_break_start_at := next_break_end_at - primary_break_duration;\n        UPDATE day_schedule_reorganization_items\n        SET is_fixed = true\n        WHERE item_id = knockout_anchor_record.item_id;\n      END IF;\n    END IF;\n  ELSE\n    next_break_start_at := NULL;\n    next_break_end_at := NULL;\n  END IF;'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    ORDER BY\n      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,\n      CASE WHEN is_selected THEN selection_order ELSE NULL END NULLS LAST,\n      original_start_at,',
    E'    ORDER BY\n      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''AUTO'' AND is_selected THEN 1\n        WHEN strategy = ''AUTO'' AND is_knockout THEN 2\n        WHEN strategy = ''AUTO'' THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,\n      CASE WHEN is_selected THEN selection_order ELSE NULL END NULLS LAST,\n      original_start_at,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'        CASE\n          WHEN strategy = ''START'' AND item_record.is_selected THEN\n            day_start_at + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')\n          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at\n          ELSE item_record.original_start_at\n        END,',
    E'        CASE\n          WHEN strategy = ''START'' AND item_record.is_selected THEN\n            day_start_at + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')\n          WHEN strategy = ''AUTO'' AND item_record.is_selected THEN\n            COALESCE((\n              SELECT max(existing_items.planned_end_at)\n              FROM day_schedule_reorganization_items AS existing_items\n              WHERE existing_items.bracket_court_id = item_record.bracket_court_id\n                AND existing_items.is_selected = false\n                AND existing_items.is_knockout = false\n                AND existing_items.planned_end_at IS NOT NULL\n                AND existing_items.original_start_at < COALESCE((\n                  SELECT min(knockout_items.original_start_at)\n                  FROM day_schedule_reorganization_items AS knockout_items\n                  WHERE knockout_items.bracket_court_id = item_record.bracket_court_id\n                    AND knockout_items.is_knockout\n                ), ''infinity''::TIMESTAMPTZ)\n            ), day_start_at) + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')\n          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at\n          ELSE item_record.original_start_at\n        END,'
  );
  build_function_definition := replace(
    build_function_definition,
    E'      IF next_break_start_at IS NOT NULL\n        AND (\n          primary_break_record.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n          OR item_record.bracket_court_id = primary_break_record.bracket_court_id\n        )\n        AND current_candidate_start < next_break_end_at\n        AND candidate_end > next_break_start_at\n      THEN',
    E'      IF next_break_start_at IS NOT NULL\n        AND (\n          primary_break_record.scope_type = ''ALL_COURTS''::public.bracket_day_break_scope_type\n          OR item_record.bracket_court_id = primary_break_record.bracket_court_id\n        )\n        AND NOT (\n          primary_break_record.scope_type = ''COURT''::public.bracket_day_break_scope_type\n          AND item_record.is_selected\n          AND (\n            should_reposition_target_court_break\n            OR current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n          )\n        )\n        AND current_candidate_start < next_break_end_at\n        AND candidate_end > next_break_start_at\n      THEN'
  );
  build_function_definition := replace(
    build_function_definition,
    E'    UPDATE day_schedule_reorganization_items\n    SET\n      planned_start_at = current_candidate_start,\n      planned_end_at = current_candidate_start + make_interval(mins => item_record.duration_minutes),\n      planned_court_position = candidate_court_position\n    WHERE item_id = item_record.item_id;\n  END LOOP;',
    E'    UPDATE day_schedule_reorganization_items\n    SET\n      planned_start_at = current_candidate_start,\n      planned_end_at = current_candidate_start + make_interval(mins => item_record.duration_minutes),\n      planned_court_position = candidate_court_position\n    WHERE item_id = item_record.item_id;\n\n    IF primary_break_record.id IS NOT NULL\n      AND primary_break_record.scope_type = ''COURT''::public.bracket_day_break_scope_type\n      AND item_record.is_selected\n      AND (\n        should_reposition_target_court_break\n        OR current_candidate_start < public.combine_bracket_schedule_timestamp(target_date, primary_break_record.break_end_time)\n      )\n    THEN\n      should_reposition_target_court_break := true;\n      next_break_start_at := GREATEST(\n        next_break_start_at,\n        current_candidate_start + make_interval(mins => item_record.duration_minutes)\n      );\n      next_break_end_at := next_break_start_at + primary_break_duration;\n    END IF;\n  END LOOP;'
  );

  IF position('should_reposition_target_court_break BOOLEAN := false' IN build_function_definition) = 0
    OR position('WHEN strategy = ''AUTO'' AND is_selected THEN 1' IN build_function_definition) = 0
    OR position('max(existing_items.planned_end_at)' IN build_function_definition) = 0
    OR position('next_break_end_at := next_break_start_at + primary_break_duration;' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível atualizar o encaixe automático e o intervalo da quadra-base.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
