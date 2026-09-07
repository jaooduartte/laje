DO $patch$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
  candidate_points_fragment TEXT := $fragment$
      group_rankings.wins,
      group_rankings.goal_diff,$fragment$;
  corrected_candidate_points_fragment TEXT := $fragment$
      group_rankings.wins,
      COALESCE(
        corrected_standings_table.corrected_points,
        group_rankings.points::numeric
      ) AS corrected_points,
      group_rankings.goal_diff,$fragment$;
  candidate_join_fragment TEXT := $fragment$
    CROSS JOIN group_size_range
    LEFT JOIN group_team_metrics$fragment$;
  corrected_candidate_join_fragment TEXT := $fragment$
    CROSS JOIN group_size_range
    LEFT JOIN public.get_championship_corrected_group_standings(
      _championship_id,
      competition_context.season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.competition_id = group_rankings.competition_id
      AND corrected_standings_table.group_id = group_rankings.group_id
      AND corrected_standings_table.team_id = group_rankings.team_id
    LEFT JOIN group_team_metrics$fragment$;
  point_tie_fragment TEXT := $fragment$CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN round(scored_candidate_rows.proportional_points, 12) ELSE scored_candidate_rows.points_base::numeric END,$fragment$;
  corrected_point_tie_fragment TEXT := $fragment$scored_candidate_rows.corrected_points,$fragment$;
  point_sort_fragment TEXT := $fragment$CASE WHEN scored_candidate_rows.uses_article_8_tiebreak THEN scored_candidate_rows.proportional_points ELSE scored_candidate_rows.points_base::numeric END DESC,$fragment$;
  corrected_point_sort_fragment TEXT := $fragment$scored_candidate_rows.corrected_points DESC,$fragment$;
  standard_wins_fragment TEXT := $fragment$          'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule$fragment$;
  corrected_standard_wins_fragment TEXT := $fragment$          'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule$fragment$;
BEGIN
  SELECT pg_get_functiondef(functions_table.oid)
  INTO function_definition
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.proname = 'get_championship_bracket_competition_qualification_pool_ranking'
    AND pg_get_function_identity_arguments(functions_table.oid) =
      '_championship_id uuid, _competition_id uuid';

  IF function_definition IS NULL
    OR position(candidate_points_fragment IN function_definition) = 0
    OR position(candidate_join_fragment IN function_definition) = 0
    OR position(point_tie_fragment IN function_definition) = 0
    OR position(point_sort_fragment IN function_definition) = 0
    OR position(standard_wins_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de pool de classificação não possui a estrutura esperada para equalizar os pontos.';
  END IF;

  patched_definition := replace(
    replace(
      replace(
        replace(
          replace(
            function_definition,
            candidate_points_fragment,
            corrected_candidate_points_fragment
          ),
          candidate_join_fragment,
          corrected_candidate_join_fragment
        ),
        point_tie_fragment,
        corrected_point_tie_fragment
      ),
      point_sort_fragment,
      corrected_point_sort_fragment
    ),
    standard_wins_fragment,
    corrected_standard_wins_fragment
  );

  EXECUTE patched_definition;
END;
$patch$;

DO $func$
DECLARE
  championship_record RECORD;
  competition_record RECORD;
  first_round_match_record RECORD;
  qualified_team_ids UUID[];
  slot_index INTEGER;
  expected_home_team_id UUID;
  expected_away_team_id UUID;
BEGIN
  SELECT
    championships_table.id,
    championships_table.current_season_year
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
  LIMIT 1;

  IF championship_record.id IS NULL THEN
    RAISE EXCEPTION 'Campeonato INTERLAJE não encontrado para corrigir as quartas de futsal masculino.';
  END IF;

  SELECT competitions_table.id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
    AND public.normalize_sport_name(sports_table.name) = 'futsal'
    AND competitions_table.naipe = 'MASCULINO'::public.match_naipe
    AND competitions_table.division IS NULL
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição de futsal masculino do INTERLAJE não encontrada para a temporada atual.';
  END IF;

  WITH qualification_pool AS (
    SELECT
      qualification_pool_rankings.team_id,
      qualification_pool_rankings.qualification_rank,
      row_number() OVER (
        PARTITION BY qualification_pool_rankings.qualification_rank
        ORDER BY qualification_pool_rankings.pool_rank
      )::integer AS qualification_pool_rank
    FROM public.get_championship_bracket_competition_qualification_pool_rankings(
      championship_record.id,
      competition_record.id
    ) AS qualification_pool_rankings
  ),
  direct_qualification AS (
    SELECT count(*)::integer AS team_count
    FROM qualification_pool
    WHERE qualification_rank = 1
  ),
  qualified_pool AS (
    SELECT qualification_pool.*
    FROM qualification_pool
    CROSS JOIN direct_qualification
    WHERE qualification_pool.qualification_rank = 1
      OR (
        qualification_pool.qualification_rank = 2
        AND qualification_pool.qualification_pool_rank <= 8 - direct_qualification.team_count
      )
  )
  SELECT array_agg(
    qualified_pool.team_id
    ORDER BY
      qualified_pool.qualification_rank,
      qualified_pool.qualification_pool_rank
  )
  INTO qualified_team_ids
  FROM qualified_pool;

  IF COALESCE(cardinality(qualified_team_ids), 0) <> 8 THEN
    RAISE EXCEPTION 'A classificação corrigida não definiu oito participantes para as quartas de futsal masculino.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
  ) <> 4 THEN
    RAISE EXCEPTION 'A estrutura persistida não contém exatamente quatro quartas de futsal masculino.';
  END IF;

  FOR slot_index IN 1..4 LOOP
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      matches_table.status,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye
    INTO first_round_match_record
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    LIMIT 1;

    IF first_round_match_record.id IS NULL
      OR first_round_match_record.match_id IS NULL
      OR first_round_match_record.status IS DISTINCT FROM 'SCHEDULED'::public.match_status
      OR first_round_match_record.winner_team_id IS NOT NULL
      OR first_round_match_record.is_bye IS NOT FALSE THEN
      RAISE EXCEPTION 'A quarta %, do futsal masculino, não está disponível para correção segura.', slot_index;
    END IF;

    expected_home_team_id := qualified_team_ids[slot_index];
    expected_away_team_id := qualified_team_ids[9 - slot_index];

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = expected_home_team_id,
      away_team_id = expected_away_team_id
    WHERE bracket_matches_table.id = first_round_match_record.id
      AND (
        bracket_matches_table.home_team_id IS DISTINCT FROM expected_home_team_id
        OR bracket_matches_table.away_team_id IS DISTINCT FROM expected_away_team_id
      );

    PERFORM public.sync_championship_bracket_match_participants(first_round_match_record.id);
  END LOOP;
END;
$func$;
