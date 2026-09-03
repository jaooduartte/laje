DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.resolve_knockout_schedule_swap_conflict(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar a validação de troca de mata-mata.';
  END IF;

  function_definition := replace(
    function_definition,
    'competitions_table.season_year',
    'editions_table.season_year'
  );

  IF position('competitions_table.season_year' IN function_definition) > 0
    OR position('JOIN public.championship_bracket_editions AS editions_table' IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível corrigir a temporada da troca de mata-mata.';
  END IF;

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
