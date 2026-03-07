DO $migration_groups$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NOT NULL THEN
    SELECT pg_get_functiondef(function_signature)
    INTO function_definition;

    IF position('#variable_conflict use_variable' IN function_definition) = 0 THEN
      function_definition := replace(
        function_definition,
        E'AS $function$\nDECLARE',
        E'AS $function$\n#variable_conflict use_variable\nDECLARE'
      );

      function_definition := replace(
        function_definition,
        E'AS $$\nDECLARE',
        E'AS $$\n#variable_conflict use_variable\nDECLARE'
      );

      EXECUTE function_definition;
    END IF;
  END IF;
END;
$migration_groups$;

DO $migration_knockout$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_knockout(uuid, uuid)');

  IF function_signature IS NOT NULL THEN
    SELECT pg_get_functiondef(function_signature)
    INTO function_definition;

    IF position('#variable_conflict use_variable' IN function_definition) = 0 THEN
      function_definition := replace(
        function_definition,
        E'AS $function$\nDECLARE',
        E'AS $function$\n#variable_conflict use_variable\nDECLARE'
      );

      function_definition := replace(
        function_definition,
        E'AS $$\nDECLARE',
        E'AS $$\n#variable_conflict use_variable\nDECLARE'
      );

      EXECUTE function_definition;
    END IF;
  END IF;
END;
$migration_knockout$;

NOTIFY pgrst, 'reload schema';
