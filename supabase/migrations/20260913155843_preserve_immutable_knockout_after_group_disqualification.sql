DO $collective_patch$
DECLARE
  function_definition TEXT;
  declarations_fragment TEXT := $fragment$
  updated_matches_count INTEGER := 0;
  has_generated_knockout BOOLEAN := false;
  actor_user_id UUID := auth.uid();
BEGIN$fragment$;
  patched_declarations_fragment TEXT := $fragment$
  updated_matches_count INTEGER := 0;
  has_generated_knockout BOOLEAN := false;
  has_immutable_knockout BOOLEAN := false;
  has_disqualified_team_in_knockout BOOLEAN := false;
  actor_user_id UUID := auth.uid();
BEGIN$fragment$;
  generated_knockout_fragment TEXT := $fragment$
  INTO has_generated_knockout;
  INSERT INTO public.championship_competition_team_disqualifications ($fragment$;
  patched_generated_knockout_fragment TEXT := $fragment$
  INTO has_generated_knockout;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND matches_table.status <> 'SCHEDULED'::public.match_status
  )
  INTO has_immutable_knockout;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND (
        matches_table.home_team_id = _team_id
        OR matches_table.away_team_id = _team_id
      )
  )
  INTO has_disqualified_team_in_knockout;

  IF has_immutable_knockout AND has_disqualified_team_in_knockout THEN
    RAISE EXCEPTION 'A atlética participa de um jogo eliminatório que não pode ser alterado.';
  END IF;
  INSERT INTO public.championship_competition_team_disqualifications ($fragment$;
  refresh_fragment TEXT := $fragment$
  PERFORM public.refresh_championship_knockout_competition_after_disqualification(
    _championship_id,
    competition_record.id
  );$fragment$;
  patched_refresh_fragment TEXT := $fragment$
  IF has_immutable_knockout = false THEN
    PERFORM public.refresh_championship_knockout_competition_after_disqualification(
      _championship_id,
      competition_record.id
    );
  END IF;$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.disqualify_championship_collective_team_competition(uuid,integer,uuid,public.match_naipe,public.team_division,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(declarations_fragment IN function_definition) = 0
    OR position(generated_knockout_fragment IN function_definition) = 0
    OR position(refresh_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de desclassificação coletiva não possui a estrutura esperada.';
  END IF;

  function_definition := replace(function_definition, declarations_fragment, patched_declarations_fragment);
  function_definition := replace(function_definition, generated_knockout_fragment, patched_generated_knockout_fragment);
  function_definition := replace(function_definition, refresh_fragment, patched_refresh_fragment);

  EXECUTE function_definition;
END;
$collective_patch$;

NOTIFY pgrst, 'reload schema';
