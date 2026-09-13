DO $collective_patch$
DECLARE
  function_definition TEXT;
  declarations_fragment TEXT := $fragment$
  updated_matches_count INTEGER := 0;
  actor_user_id UUID := auth.uid();
BEGIN$fragment$;
  patched_declarations_fragment TEXT := $fragment$
  updated_matches_count INTEGER := 0;
  has_generated_knockout BOOLEAN := false;
  actor_user_id UUID := auth.uid();
BEGIN$fragment$;
  team_participation_fragment TEXT := $fragment$
  END IF;

  INSERT INTO public.championship_competition_team_disqualifications ($fragment$;
  patched_team_participation_fragment TEXT := $fragment$
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
  )
  INTO has_generated_knockout;

  IF has_generated_knockout
    AND EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = competition_record.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
        AND matches_table.status <> 'SCHEDULED'::public.match_status
    ) THEN
    RAISE EXCEPTION 'A desclassificação exige que todos os jogos eliminatórios permaneçam agendados.';
  END IF;

  INSERT INTO public.championship_competition_team_disqualifications ($fragment$;
  affected_matches_fragment TEXT := $fragment$
      AND (
        matches_table.home_team_id = _team_id
        OR matches_table.away_team_id = _team_id
      )
  LOOP$fragment$;
  patched_affected_matches_fragment TEXT := $fragment$
      AND (
        matches_table.home_team_id = _team_id
        OR matches_table.away_team_id = _team_id
      )
      AND (
        bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        OR has_generated_knockout = false
      )
  LOOP$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.disqualify_championship_collective_team_competition(uuid,integer,uuid,public.match_naipe,public.team_division,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(declarations_fragment IN function_definition) = 0
    OR position(team_participation_fragment IN function_definition) = 0
    OR position(affected_matches_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de desclassificação coletiva não possui a estrutura esperada.';
  END IF;

  function_definition := replace(function_definition, declarations_fragment, patched_declarations_fragment);
  function_definition := replace(function_definition, team_participation_fragment, patched_team_participation_fragment);
  function_definition := replace(function_definition, affected_matches_fragment, patched_affected_matches_fragment);

  EXECUTE function_definition;
END;
$collective_patch$;

DO $refresh_patch$
DECLARE
  function_definition TEXT;
  declarations_fragment TEXT := $fragment$
  standard_seed_order INTEGER[];
  home_seed_index INTEGER;
  away_seed_index INTEGER;$fragment$;
  patched_declarations_fragment TEXT := $fragment$
  standard_seed_order INTEGER[];
  home_seed_index INTEGER;
  away_seed_index INTEGER;$fragment$;
  competition_fragment TEXT := $fragment$
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams$fragment$;
  patched_competition_fragment TEXT := $fragment$
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.knockout_pairing_mode$fragment$;
  linear_seed_fragment TEXT := $fragment$
  standard_seed_order := ARRAY[]::INTEGER[];
  FOR seed_iter IN 1..(bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, bracket_size + 1 - seed_iter);
  END LOOP;
$fragment$;
  configured_seed_fragment TEXT := $fragment$
  standard_seed_order := public.resolve_championship_knockout_seed_order(
    competition_record.knockout_pairing_mode,
    bracket_size
  );

  IF COALESCE(cardinality(standard_seed_order), 0) <> bracket_size THEN
    RAISE EXCEPTION 'O modo de cruzamento da competição não gerou uma ordem de classificados válida.';
  END IF;
$fragment$;
BEGIN
  SELECT pg_get_functiondef(
    'public.refresh_championship_knockout_competition_after_disqualification(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(declarations_fragment IN function_definition) = 0
    OR position(competition_fragment IN function_definition) = 0
    OR position(linear_seed_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de atualização da chave não possui a estrutura esperada.';
  END IF;

  function_definition := replace(function_definition, declarations_fragment, patched_declarations_fragment);
  function_definition := replace(function_definition, competition_fragment, patched_competition_fragment);
  function_definition := replace(function_definition, linear_seed_fragment, configured_seed_fragment);

  EXECUTE function_definition;
END;
$refresh_patch$;

NOTIFY pgrst, 'reload schema';
