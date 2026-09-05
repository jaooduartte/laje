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
    'sessions_table.start_time < items_table.planned_end_at',
    'sessions_table.start_time < (items_table.planned_end_at AT TIME ZONE ''America/Sao_Paulo'')::TIME'
  );
  function_definition := replace(
    function_definition,
    'sessions_table.end_time > items_table.planned_start_at',
    'sessions_table.end_time > (items_table.planned_start_at AT TIME ZONE ''America/Sao_Paulo'')::TIME'
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
