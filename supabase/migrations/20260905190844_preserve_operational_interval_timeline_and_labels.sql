DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_operational_schedule_interval_preview(uuid,jsonb)'::REGPROCEDURE
  )
  INTO function_definition;

  function_definition := replace(
    function_definition,
    'COALESCE(
      matches_table.end_time,
      matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))
    )',
    'matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))'
  );
  function_definition := replace(
    function_definition,
    'SELECT COALESCE(max(planned_end_at), public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value))
    INTO cursor_at',
    'SELECT max(planned_end_at)
    INTO cursor_at'
  );
  function_definition := replace(
    function_definition,
    'candidate_start_at := GREATEST(cursor_at, public.combine_bracket_schedule_timestamp(day_record.event_date, anchor_time_value));',
    'candidate_start_at := GREATEST(
      item_record.original_start_at,
      COALESCE(cursor_at, item_record.original_start_at)
    );'
  );
  function_definition := replace(
    function_definition,
    'IF public.resolve_scheduled_match_rest_gap_conflict(',
    'IF false AND public.resolve_scheduled_match_rest_gap_conflict('
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
