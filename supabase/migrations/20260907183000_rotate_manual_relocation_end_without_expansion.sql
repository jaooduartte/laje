DO $rotate_manual_relocation_end_without_expansion$
DECLARE
  preview_definition TEXT;
  patched_preview_definition TEXT;
  placeholder_definition TEXT;
  patched_placeholder_definition TEXT;
  end_cursor_anchor TEXT := $anchor$
  FOR plan_record IN$anchor$;
  end_cursor_patch TEXT := $patch$
  IF insertion_position = 'END' AND target_start_time IS NULL THEN
    SELECT COALESCE(
      min(old_start_time),
      public.combine_bracket_schedule_timestamp(target_date, effective_start_time)
    )
    INTO current_cursor_at
    FROM manual_match_relocation_plan;
  END IF;

  FOR plan_record IN$patch$;
  numbering_anchor TEXT := $anchor$
  WHERE numbered_matches.match_id = plan_table.match_id;$anchor$;
  numbering_patch TEXT := $patch$
  WHERE numbered_matches.match_id = plan_table.match_id;

  IF insertion_position = 'END' AND target_start_time IS NULL THEN
    UPDATE manual_match_relocation_plan AS plan_table
    SET
      new_queue_position = numbered_matches.position,
      new_scheduled_slot = numbered_matches.slot
    FROM (
      SELECT
        match_id,
        COALESCE((
          SELECT min(old_queue_position) - 1
          FROM manual_match_relocation_plan
          WHERE new_start_time IS NOT NULL
        ), 0) + row_number() OVER (ORDER BY new_start_time, source_order)::INTEGER AS position,
        COALESCE((
          SELECT min(old_scheduled_slot) - 1
          FROM manual_match_relocation_plan
          WHERE new_start_time IS NOT NULL
        ), 0) + row_number() OVER (ORDER BY new_start_time, source_order)::INTEGER AS slot
      FROM manual_match_relocation_plan
      WHERE new_start_time IS NOT NULL
    ) AS numbered_matches
    WHERE numbered_matches.match_id = plan_table.match_id;
  END IF;$patch$;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_manual_match_relocation_preview_base(uuid,jsonb)'::regprocedure
  )
  INTO preview_definition;

  IF preview_definition IS NULL
    OR position('IF insertion_position = ''START'' OR target_start_time IS NOT NULL THEN' IN preview_definition) = 0
    OR position('WHERE insertion_position = ''START'' OR is_selected = true OR target_start_time IS NOT NULL' IN preview_definition) = 0
    OR position(end_cursor_anchor IN preview_definition) = 0
    OR position(numbering_anchor IN preview_definition) = 0 THEN
    RAISE EXCEPTION 'A estrutura esperada da prévia de realocação manual não foi encontrada.';
  END IF;

  patched_preview_definition := replace(
    preview_definition,
    'IF insertion_position = ''START'' OR target_start_time IS NOT NULL THEN',
    'IF insertion_position IN (''START'', ''END'') OR target_start_time IS NOT NULL THEN'
  );

  patched_preview_definition := replace(
    patched_preview_definition,
    'WHERE insertion_position = ''START'' OR is_selected = true OR target_start_time IS NOT NULL',
    'WHERE insertion_position IN (''START'', ''END'') OR is_selected = true OR target_start_time IS NOT NULL'
  );

  patched_preview_definition := replace(
    patched_preview_definition,
    'COALESCE(matches_table.end_time, matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1)))',
    'matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))'
  );

  patched_preview_definition := replace(
    patched_preview_definition,
    end_cursor_anchor,
    end_cursor_patch
  );

  patched_preview_definition := replace(
    patched_preview_definition,
    numbering_anchor,
    numbering_patch
  );

  EXECUTE patched_preview_definition;

  SELECT pg_get_functiondef(
    'public.append_manual_relocation_placeholders(uuid,jsonb)'::regprocedure
  )
  INTO placeholder_definition;

  IF placeholder_definition IS NULL
    OR position('  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN' IN placeholder_definition) = 0 THEN
    RAISE EXCEPTION 'A complementação de placeholders da prévia de realocação não foi encontrada.';
  END IF;

  patched_placeholder_definition := replace(
    placeholder_definition,
    $source$
  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN
    RETURN _preview;
  END IF;$source$,
    $target$
  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN
    RETURN _preview;
  END IF;

  IF upper(COALESCE(_preview->>'insertion_position', '')) = 'END' THEN
    RETURN _preview;
  END IF;$target$
  );

  EXECUTE patched_placeholder_definition;
END;
$rotate_manual_relocation_end_without_expansion$;
