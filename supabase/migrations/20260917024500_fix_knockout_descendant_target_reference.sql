DO $migration$
DECLARE
  function_definition TEXT;
  invalid_update_fragment TEXT := $old$
    UPDATE public.championship_bracket_matches AS target
    SET
      home_team_id = source_home.winner_team_id,
      away_team_id = source_away.winner_team_id,
      winner_team_id = NULL,
      match_id = CASE WHEN descendant_path.depth = 1 THEN target.match_id ELSE NULL END
    FROM descendant_path
    LEFT JOIN public.championship_bracket_matches AS source_home
      ON source_home.id = target.source_home_bracket_match_id
    LEFT JOIN public.championship_bracket_matches AS source_away
      ON source_away.id = target.source_away_bracket_match_id
    WHERE target.id = descendant_path.id
      AND descendant_path.depth > 1;$old$;
  corrected_update_fragment TEXT := $new$
    UPDATE public.championship_bracket_matches AS target
    SET
      home_team_id = (
        SELECT source_home.winner_team_id
        FROM public.championship_bracket_matches AS source_home
        WHERE source_home.id = target.source_home_bracket_match_id
      ),
      away_team_id = (
        SELECT source_away.winner_team_id
        FROM public.championship_bracket_matches AS source_away
        WHERE source_away.id = target.source_away_bracket_match_id
      ),
      winner_team_id = NULL,
      match_id = NULL
    FROM descendant_path
    WHERE target.id = descendant_path.id
      AND descendant_path.depth > 1;$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_knockout_result_correction(uuid,text,text,text)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Função apply_knockout_result_correction não encontrada.';
  END IF;

  IF strpos(function_definition, corrected_update_fragment) > 0 THEN
    RETURN;
  END IF;

  IF strpos(function_definition, invalid_update_fragment) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado de apply_knockout_result_correction não foi encontrado; revise a versão atualmente aplicada antes de continuar.';
  END IF;

  function_definition := replace(
    function_definition,
    invalid_update_fragment,
    corrected_update_fragment
  );

  EXECUTE function_definition;
END;
$migration$;

COMMENT ON FUNCTION public.apply_knockout_result_correction(UUID, TEXT, TEXT, TEXT)
IS 'Aplica atomicamente uma correção retroativa por W.O.; a recomposição dos slots descendentes usa subconsultas correlacionadas válidas para preservar vencedores dos ramos não afetados.';

NOTIFY pgrst, 'reload schema';
