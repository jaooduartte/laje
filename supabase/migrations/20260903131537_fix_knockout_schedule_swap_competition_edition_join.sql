DO $$
DECLARE
  function_definition TEXT;
  competition_join TEXT := E'  JOIN public.championship_bracket_competitions AS competitions_table\n    ON competitions_table.id = bracket_matches_table.competition_id';
  edition_join TEXT := E'  JOIN public.championship_bracket_competitions AS competitions_table\n    ON competitions_table.id = bracket_matches_table.competition_id\n  JOIN public.championship_bracket_editions AS editions_table\n    ON editions_table.id = competitions_table.bracket_edition_id';
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
    'competitions_table.championship_id',
    'editions_table.championship_id'
  );
  function_definition := replace(
    function_definition,
    'competitions_table.season_year',
    'editions_table.season_year'
  );
  function_definition := replace(
    function_definition,
    competition_join,
    edition_join
  );

  IF position('competitions_table.championship_id' IN function_definition) > 0
    OR position('competitions_table.season_year' IN function_definition) > 0
    OR position('JOIN public.championship_bracket_editions AS editions_table' IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível corrigir a validação de troca de mata-mata.';
  END IF;

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
