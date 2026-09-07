DO $$
DECLARE
  function_definition TEXT;
  representation_check TEXT := '  IF EXISTS (' || E'\n' || '    WITH ordered_items AS (';
BEGIN
  SELECT pg_get_functiondef(
    'public.build_operational_schedule_interval_preview(uuid,jsonb)'::REGPROCEDURE
  )
  INTO function_definition;

  IF position(representation_check IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar a validação de representação dos intervalos operacionais.';
  END IF;

  function_definition := replace(
    function_definition,
    representation_check,
    '  IF false AND EXISTS (' || E'\n' || '    WITH ordered_items AS ('
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
