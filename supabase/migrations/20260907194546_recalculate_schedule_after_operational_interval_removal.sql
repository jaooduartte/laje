DO $$
DECLARE
  function_definition TEXT;
  existing_candidate_start_assignment TEXT := '    candidate_start_at := GREATEST(' || E'\n' || '      item_record.original_start_at,' || E'\n' || '      COALESCE(cursor_at, item_record.original_start_at)' || E'\n' || '    );';
  updated_candidate_start_assignment TEXT := '    candidate_start_at := CASE' || E'\n' || '      WHEN interval_action = ''REMOVE'' THEN GREATEST(' || E'\n' || '        public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value),' || E'\n' || '        COALESCE(cursor_at, public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value))' || E'\n' || '      )' || E'\n' || '      ELSE GREATEST(' || E'\n' || '        item_record.original_start_at,' || E'\n' || '        COALESCE(cursor_at, item_record.original_start_at)' || E'\n' || '      )' || E'\n' || '    END;';
BEGIN
  SELECT pg_get_functiondef(
    'public.build_operational_schedule_interval_preview(uuid,jsonb)'::REGPROCEDURE
  )
  INTO function_definition;

  IF position(existing_candidate_start_assignment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar o cálculo atual da programação após intervalo.';
  END IF;

  function_definition := replace(
    function_definition,
    existing_candidate_start_assignment,
    updated_candidate_start_assignment
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
