DO $func$
DECLARE
  function_definition TEXT;
  match_status_clause CONSTANT TEXT :=
    'AND matches_table.status = ''FINISHED''::public.match_status';
  filtered_match_status_clause CONSTANT TEXT :=
    'AND matches_table.status = ''FINISHED''::public.match_status' || E'\n'
    || '      AND COALESCE(matches_table.is_double_walkover, false) = false';
BEGIN
  SELECT pg_get_functiondef(functions_table.oid)
  INTO function_definition
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.proname =
      'get_championship_bracket_competition_group_rankings'
    AND pg_get_function_identity_arguments(functions_table.oid) =
      '_championship_id uuid, _competition_id uuid';

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Função de classificação por grupo não encontrada.';
  END IF;

  IF position('is_double_walkover' IN function_definition) > 0 THEN
    RETURN;
  END IF;

  IF (
    length(function_definition)
    - length(replace(function_definition, match_status_clause, ''))
  ) / length(match_status_clause) <> 3 THEN
    RAISE EXCEPTION 'A definição da classificação por grupo não possui os filtros esperados.';
  END IF;

  EXECUTE replace(
    function_definition,
    match_status_clause,
    filtered_match_status_clause
  );
END;
$func$;

NOTIFY pgrst, 'reload schema';
