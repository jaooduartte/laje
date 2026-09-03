DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(procedure_table.oid)
  INTO function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'build_day_schedule_reorganization_preview'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _payload jsonb';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'A função de reorganização diária não foi encontrada.';
  END IF;

  IF position('target_start_time := NULLIF(_payload->>''target_start_time'', '''')::TIME;' IN function_definition) = 0
    OR position('IF strategy NOT IN (''ANCHOR'', ''AUTO'') THEN' IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da função de reorganização diária não está instalada.';
  END IF;

  function_definition := replace(
    function_definition,
    '  target_start_time := NULLIF(_payload->>''target_start_time'', '''')::TIME;',
    '  target_start_time := NULLIF(_payload->>''day_start_time'', '''')::TIME;'
  );
  function_definition := replace(
    function_definition,
    '  IF strategy NOT IN (''ANCHOR'', ''AUTO'') THEN',
    '  IF strategy NOT IN (''START'', ''END'', ''AUTO'') THEN'
  );
  function_definition := replace(
    function_definition,
    E'  day_start_at := public.combine_bracket_schedule_timestamp(target_date, day_record.start_time);\n  day_end_at := public.combine_bracket_schedule_timestamp(target_date, day_record.end_time);\n  previous_day_start := to_char(day_start_at AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'');\n  previous_day_end := to_char(day_end_at AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'');',
    E'  previous_day_start := to_char(public.combine_bracket_schedule_timestamp(target_date, day_record.start_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'');\n  previous_day_end := to_char(public.combine_bracket_schedule_timestamp(target_date, day_record.end_time) AT TIME ZONE ''America/Sao_Paulo'', ''HH24:MI'');\n\n  IF target_start_time IS NOT NULL AND target_start_time > day_record.start_time THEN\n    RAISE EXCEPTION ''O novo horário de início do dia deve antecipar ou manter o início já configurado.'';\n  END IF;\n\n  day_start_at := public.combine_bracket_schedule_timestamp(target_date, COALESCE(target_start_time, day_record.start_time));\n  day_end_at := public.combine_bracket_schedule_timestamp(target_date, day_record.end_time);'
  );
  function_definition := replace(
    function_definition,
    E'    ORDER BY\n      CASE WHEN strategy = ''ANCHOR'' AND is_selected THEN 0 ELSE 1 END,\n      CASE\n        WHEN strategy = ''ANCHOR'' AND is_selected THEN selection_order\n        ELSE NULL\n      END NULLS LAST,\n      original_start_at,',
    E'    ORDER BY\n      CASE\n        WHEN strategy = ''START'' AND is_selected THEN 0\n        WHEN strategy = ''END'' AND is_selected THEN 2\n        ELSE 1\n      END,\n      CASE WHEN is_selected THEN selection_order ELSE NULL END NULLS LAST,\n      original_start_at,'
  );
  function_definition := replace(
    function_definition,
    E'        CASE\n          WHEN strategy = ''ANCHOR'' AND item_record.is_selected THEN\n            public.combine_bracket_schedule_timestamp(target_date, COALESCE(target_start_time, day_record.start_time))\n              + make_interval(mins => COALESCE((item_record.selection_order - 1) * item_record.duration_minutes, 0))\n          ELSE item_record.original_start_at\n        END,',
    E'        CASE\n          WHEN strategy = ''START'' AND item_record.is_selected THEN\n            day_start_at + COALESCE((\n              SELECT sum(make_interval(mins => selected_items.duration_minutes))\n              FROM day_schedule_reorganization_items AS selected_items\n              WHERE selected_items.is_selected\n                AND selected_items.selection_order < item_record.selection_order\n            ), INTERVAL ''0 minutes'')\n          WHEN strategy = ''END'' AND item_record.is_selected THEN day_start_at\n          ELSE item_record.original_start_at\n        END,'
  );
  function_definition := replace(
    function_definition,
    E'    ''insertion_position'', ''SLOT'',',
    E'    ''insertion_position'', CASE WHEN strategy = ''START'' THEN ''START'' WHEN strategy = ''END'' THEN ''END'' ELSE ''SLOT'' END,'
  );

  IF position('day_start_time' IN function_definition) = 0
    OR position('strategy = ''START''' IN function_definition) = 0
    OR position('strategy = ''END''' IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível atualizar a função de reorganização diária.';
  END IF;

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
