DO $$
DECLARE
  function_definition TEXT;
  enabled_interval_update_setting TEXT := '  PERFORM set_config(''app.allow_operational_schedule_interval_match_update'', ''true'', true);';
  disabled_interval_update_setting TEXT := '  PERFORM set_config(''app.allow_operational_schedule_interval_match_update'', ''false'', true);';
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_operational_schedule_interval(uuid,jsonb,bigint)'::REGPROCEDURE
  )
  INTO function_definition;

  IF position(enabled_interval_update_setting IN function_definition) = 0
    OR position(disabled_interval_update_setting IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar as permissões transacionais dos intervalos operacionais.';
  END IF;

  function_definition := replace(
    function_definition,
    enabled_interval_update_setting,
    enabled_interval_update_setting || E'\n' || '  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''true'', true);'
  );
  function_definition := replace(
    function_definition,
    disabled_interval_update_setting,
    disabled_interval_update_setting || E'\n' || '  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''false'', true);'
  );

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
